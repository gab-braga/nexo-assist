import "server-only";
import type { ClientSession, Filter } from "mongodb";
import type { Conversation, Message } from "@/types/domain";
import { database } from "@/server/lib/mongodb";
import { AppError, databaseOperation } from "@/server/lib/errors";
import { createHash, randomUUID } from "node:crypto";
import type { SessionUser } from "@/types/domain";
import type { AgentRun } from "@/types/ai";
import type { TicketDraft } from "@/types/tickets";
import {
  analystTransition,
  summaryText,
  type AnalystOperation,
} from "@/server/policies/handoff";
import { conversationState } from "@/auth/conversation-state";
import type { Db } from "mongodb";

type ConversationEvent = {
  _id: string;
  conversationId: string;
  actorId: string;
  operation: string;
  createdAt: Date;
};

export async function conversationCollections() {
  const db = await database();
  return {
    conversations: db.collection<Conversation>("conversations"),
    messages: db.collection<Message>("messages"),
    events: db.collection<ConversationEvent>("conversation_events"),
  };
}

export async function findConversation(id: string, session?: ClientSession) {
  return databaseOperation(async () => {
    const { conversations } = await conversationCollections();
    return conversations.findOne({ _id: id }, { session });
  });
}

export async function findConversations(
  filter: Filter<Conversation>,
  limit: number,
) {
  return databaseOperation(async () => {
    const { conversations } = await conversationCollections();
    return conversations
      .find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit)
      .toArray();
  });
}

export async function findMessages(filter: Filter<Message>, limit: number) {
  return databaseOperation(async () => {
    const { messages } = await conversationCollections();
    return messages
      .find(filter)
      .sort({ sequence: -1, createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();
  });
}

export async function createConversationRecord(
  record: Conversation,
  session?: ClientSession,
) {
  const { conversations } = await conversationCollections();
  const { _id, ...fields } = record;
  await conversations.updateOne(
    { _id },
    { $setOnInsert: fields },
    { upsert: true, session },
  );
}

export async function appendMessage(
  message: Message,
  authorize: (
    conversation: Conversation | null,
    duplicate: Message | null,
  ) => void,
) {
  return databaseOperation(async () => {
    const db = await database();
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        const { conversations, messages } = await conversationCollections();
        const conversation = await findConversation(
          message.conversationId,
          session,
        );
        const existing = await messages.findOne(
          { _id: message._id },
          { session },
        );
        authorize(conversation, existing);
        if (existing) return;
        await messages.insertOne(
          {
            ...message,
            sequence: conversation!.version + 1,
            processingState: "completed",
          },
          { session },
        );
        await db
          .collection<
            ConversationEvent & {
              previousState: string;
              newState: string;
              outcome: string;
              messageId: string;
            }
          >("conversation_events")
          .insertOne(
            {
              _id: `message:${message._id}`,
              conversationId: message.conversationId,
              actorId: message.authorId,
              operation: "human_message",
              createdAt: message.createdAt,
              messageId: message._id,
              previousState: conversationState(conversation!),
              newState: conversationState(conversation!),
              outcome: "success",
            },
            { session },
          );
        const updated = await conversations.updateOne(
          { _id: message.conversationId, version: conversation!.version },
          { $set: { updatedAt: message.createdAt }, $inc: { version: 1 } },
          { session },
        );
        if (updated.modifiedCount !== 1)
          throw new AppError(
            "CONFLICT",
            "O atendimento mudou. Atualize e tente novamente.",
          );
      });
    } finally {
      await session.endSession();
    }
  });
}

/** Fences an in-flight run and all pending proposals in the caller's transaction. */
export async function pauseConversationAgent(
  db: Db,
  conversation: Conversation,
  session: ClientSession,
) {
  const now = new Date();
  if (conversation.aiActiveRunId) {
    await db
      .collection<AgentRun>("agent_runs")
      .updateOne(
        {
          _id: conversation.aiActiveRunId,
          conversationId: conversation._id,
          state: "running",
        },
        {
          $set: {
            state: "interrupted",
            errorCode: "HUMAN_CONTROL",
            completedAt: now,
          },
        },
        { session },
      );
    await db
      .collection<Message>("messages")
      .updateOne(
        { _id: conversation.aiActiveRunId, conversationId: conversation._id },
        {
          $set: {
            processingState: "interrupted",
            processingErrorCode: "HUMAN_CONTROL",
          },
        },
        { session },
      );
  }
  if (conversation.pendingDraftId)
    await db
      .collection<TicketDraft>("ticket_drafts")
      .updateOne(
        {
          _id: conversation.pendingDraftId,
          customerId: conversation.customerId,
          appliedAt: null,
          cancelledAt: null,
        },
        { $set: { cancelledAt: now } },
        { session },
      );
}

export async function applyConversationTransition(
  user: SessionUser,
  input: {
    requestId?: string;
    conversationId: string;
    version: number;
    operation: AnalystOperation;
  },
) {
  const hash = createHash("sha256")
    .update(
      JSON.stringify([
        user.uid,
        input.conversationId,
        input.version,
        input.operation,
      ]),
    )
    .digest("hex");
  const id = input.requestId ?? `transition:${hash}`;
  const db = await databaseOperation(database);
  const session = db.client.startSession();
  let authorized = false;
  try {
    return await databaseOperation(() =>
      session.withTransaction(async () => {
        const events = db.collection<
          ConversationEvent & {
            inputHash?: string;
            previousState?: string;
            newState?: string;
            outcome?: string;
            code?: string;
          }
        >("conversation_events");
        if (user.role !== "agent")
          throw new AppError(
            "FORBIDDEN",
            "Somente analistas podem alterar o atendimento.",
          );
        const previous = await events.findOne({ _id: id }, { session });
        if (previous) {
          if (previous.actorId !== user.uid || previous.inputHash !== hash)
            throw new AppError(
              "CONFLICT",
              "Identificador de operação já utilizado.",
            );
          return;
        }
        const conversation = await db
          .collection<Conversation>("conversations")
          .findOne({ _id: input.conversationId }, { session });
        if (!conversation)
          throw new AppError("NOT_FOUND", "Atendimento não encontrado.");
        authorized = true;
        if (conversation.version !== input.version)
          throw new AppError(
            "CONFLICT",
            "O atendimento mudou ou já foi assumido. Atualize e tente novamente.",
          );
        const update = analystTransition(user, conversation, input.operation);
        const now = new Date();
        const notice =
          input.operation === "assume"
            ? `${user.name} assumiu o atendimento.`
            : input.operation === "return_to_ai"
              ? `${user.name} devolveu o atendimento ao Nexo Assist. Envie uma nova mensagem para continuar.`
              : input.operation === "release"
                ? `${user.name} devolveu o atendimento à fila humana.`
                : `${user.name} encerrou este atendimento. Os chamados relacionados permanecem independentes.`;
        const after: Conversation = {
          ...conversation,
          ...update,
          version: conversation.version + 1,
          aiControlVersion: (conversation.aiControlVersion ?? 0) + 1,
          aiActiveRunId: null,
          updatedAt: now,
          flow: { intent: "clarify", stage: "idle" },
        };
        if (input.operation === "return_to_ai") {
          const human = await db
            .collection<Message>("messages")
            .find(
              { conversationId: conversation._id, role: "agent" },
              { session },
            )
            .sort({ sequence: -1, createdAt: -1, _id: -1 })
            .limit(3)
            .toArray();
          after.analystSummary = human
            .reverse()
            .map(
              (message) =>
                `${message.authorName}: ${summaryText(message.text, 500)}`,
            )
            .join("\n");
        }
        await pauseConversationAgent(db, conversation, session);
        const saved = await db
          .collection<Conversation>("conversations")
          .replaceOne(
            { _id: conversation._id, version: conversation.version },
            after,
            { session },
          );
        if (saved.modifiedCount !== 1)
          throw new AppError(
            "CONFLICT",
            "Outro analista alterou o atendimento.",
          );
        await db.collection<Message>("messages").insertOne(
          {
            _id: randomUUID(),
            conversationId: conversation._id,
            authorId: "nexo-system",
            authorName: "Atendimento",
            role: "assistant",
            text: notice,
            sequence: after.version,
            createdAt: now,
            processingState: "completed",
          },
          { session },
        );
        await events.insertOne(
          {
            _id: id,
            conversationId: conversation._id,
            actorId: user.uid,
            operation: input.operation,
            createdAt: now,
            inputHash: hash,
            previousState: conversationState(conversation),
            newState: conversationState(after),
            outcome: "success",
          },
          { session },
        );
      }),
    );
  } catch (error) {
    if (authorized && error instanceof AppError) {
      try {
        const current = await findConversation(input.conversationId);
        const state = current ? conversationState(current) : "UNKNOWN";
        await db
          .collection<
            ConversationEvent & {
              outcome: string;
              code: string;
              inputHash: string;
              previousState: string;
              newState: string;
            }
          >("conversation_events")
          .updateOne(
            { _id: `${id}:failure` },
            {
              $setOnInsert: {
                conversationId: input.conversationId,
                actorId: user.uid,
                operation: input.operation,
                createdAt: new Date(),
                outcome:
                  error.code === "PERSISTENCE_UNAVAILABLE"
                    ? "unknown"
                    : "failure",
                code: error.code,
                inputHash: hash,
                previousState: state,
                newState: state,
              },
            },
            { upsert: true },
          );
      } catch {
        /* A failed audit write must not expose persistence details. */
      }
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function transitionRecord(
  filter: Filter<Conversation>,
  update: Pick<Conversation, "status" | "agentId" | "agentName" | "updatedAt"> &
    Pick<Partial<Conversation>, "aiHandoff">,
  event: ConversationEvent,
) {
  return databaseOperation(async () => {
    const db = await database();
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        const { conversations, events } = await conversationCollections();
        const updated = await conversations.updateOne(
          filter,
          { $set: update, $inc: { version: 1, aiControlVersion: 1 } },
          { session },
        );
        if (updated.modifiedCount !== 1)
          throw new AppError(
            "CONFLICT",
            "O atendimento mudou ou pertence a outro atendente. Atualize a página.",
          );
        await events.insertOne(event, { session });
      });
    } finally {
      await session.endSession();
    }
  });
}
