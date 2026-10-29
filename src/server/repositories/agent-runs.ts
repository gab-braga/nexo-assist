import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { database } from "@/server/lib/mongodb";
import { AppError } from "@/server/lib/errors";
import type { Conversation, Message, SessionUser } from "@/types/domain";
import type { AgentRun, AgentAudit } from "@/types/ai";
import { AI_LIMITS } from "@/server/ai/config";
import { PROMPT_VERSION } from "@/server/ai/prompts/nexo";
import type { AgentTurnInput } from "@/server/ai/schemas";
import { createConversationRecord } from "./conversations";
import { conversationTitle } from "@/lib/conversation-title";

export function assertAgentConversation(
  conversation: Conversation | null,
  userId: string,
  run?: AgentRun,
) {
  if (!conversation || conversation.customerId !== userId)
    throw new AppError("NOT_FOUND", "Atendimento não encontrado.");
  if (
    !conversation.aiEnabled ||
    conversation.status !== "waiting" ||
    conversation.agentId ||
    (!run && conversation.aiHandoff) ||
    (run &&
      (conversation.aiActiveRunId !== run._id ||
        (conversation.aiControlVersion ?? 0) !== run.controlVersion))
  )
    throw new AppError(
      "HUMAN_CONTROL",
      "A conversa está com o atendimento humano ou foi encerrada.",
    );
}

export interface AgentRunRepository {
  begin(
    user: SessionUser,
    input: AgentTurnInput,
    model: string,
  ): Promise<AgentRun>;
  history(conversationId: string): Promise<Message[]>;
  assertActive(run: AgentRun): Promise<void>;
  handoff(run: AgentRun, reason: string, summary: string): Promise<void>;
  finish(
    run: AgentRun,
    text: string | null,
    audit: AgentAudit[],
    usage: AgentRun["usage"],
    code?: string,
  ): Promise<Message | null>;
}

export const agentRunRepository: AgentRunRepository = {
  async begin(user, input, model) {
    const db = await database();
    const session = db.client.startSession();
    try {
      return await session.withTransaction(async () => {
        const conversations = db.collection<Conversation>("conversations");
        const runs = db.collection<AgentRun>("agent_runs");
        let conversation = await conversations.findOne(
          { _id: input.conversationId },
          { session },
        );
        if (!conversation && input.startConversation) {
          const now = new Date();
          conversation = {
            _id: input.conversationId,
            customerId: user.uid,
            customerName: user.name,
            subject: conversationTitle(input.text),
            status: "waiting",
            agentId: null,
            agentName: null,
            createdAt: now,
            updatedAt: now,
            version: 0,
            aiEnabled: true,
            initialMessageId: input.requestId,
          };
          // The first message, run and conversation either all commit or all roll back.
          await createConversationRecord(conversation, session);
        }
        if (!conversation || conversation.customerId !== user.uid)
          throw new AppError("NOT_FOUND", "Atendimento não encontrado.");
        if (
          input.startConversation &&
          conversation.initialMessageId !== input.requestId
        )
          throw new AppError(
            "CONFLICT",
            "O primeiro envio desta conversa já foi registrado.",
          );
        const hash = createHash("sha256").update(input.text).digest("hex");
        const previous = await runs.findOne(
          { _id: input.requestId },
          { session },
        );
        if (previous) {
          if (
            previous.customerId !== user.uid ||
            previous.conversationId !== input.conversationId ||
            previous.inputHash !== hash
          )
            throw new AppError(
              "CONFLICT",
              "Identificador de mensagem já utilizado.",
            );
          if (previous.state === "running")
            throw new AppError(
              "RUN_IN_PROGRESS",
              "Essa mensagem já está sendo processada.",
            );
          return previous;
        }
        assertAgentConversation(conversation, user.uid);
        if ((conversation.aiMessageCount ?? 0) >= AI_LIMITS.messages)
          throw new AppError(
            "MESSAGE_LIMIT",
            "Limite de 30 mensagens atingido. Solicite atendimento humano por um novo atendimento.",
          );
        if (conversation.aiActiveRunId) {
          const active = await runs.findOne(
            { _id: conversation.aiActiveRunId },
            { session },
          );
          if (active?.state === "running" && active.expiresAt > new Date())
            throw new AppError(
              "RUN_IN_PROGRESS",
              "Aguarde a resposta anterior.",
            );
          if (active?.state === "running")
            await runs.updateOne(
              { _id: active._id },
              {
                $set: {
                  state: "failed",
                  errorCode: "TIMEOUT",
                  completedAt: new Date(),
                },
              },
              { session },
            );
        }
        const now = new Date();
        const run: AgentRun = {
          _id: input.requestId,
          conversationId: input.conversationId,
          customerId: user.uid,
          inputHash: hash,
          controlVersion: conversation.aiControlVersion ?? 0,
          state: "running",
          createdAt: now,
          expiresAt: new Date(now.getTime() + AI_LIMITS.timeoutMs + 10000),
          completedAt: null,
          response: null,
          responseId: randomUUID(),
          errorCode: null,
          model,
          promptVersion: PROMPT_VERSION,
          audit: [],
          usage: null,
        };
        await runs.insertOne(run, { session });
        await db.collection<Message>("messages").insertOne(
          {
            _id: input.requestId,
            conversationId: input.conversationId,
            authorId: user.uid,
            authorName: user.name,
            role: "chat",
            text: input.text,
            createdAt: now,
          },
          { session },
        );
        const updated = await conversations.updateOne(
          { _id: conversation._id, version: conversation.version },
          {
            $set: { aiActiveRunId: run._id, updatedAt: now },
            $inc: { aiMessageCount: 1, version: 1 },
          },
          { session },
        );
        if (updated.modifiedCount !== 1)
          throw new AppError(
            "CONFLICT",
            "A conversa mudou. Atualize e tente novamente.",
          );
        return run;
      });
    } catch (error) {
      // Concurrent initial inserts may report duplicate-key instead of a retryable
      // transaction conflict. Never repeat the model invocation or change IDs.
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === 11000
      )
        throw new AppError(
          "CONFLICT",
          "Envio concorrente. Repita a mesma requisição para verificar o resultado.",
        );
      throw error;
    } finally {
      await session.endSession();
    }
  },
  async history(conversationId) {
    return (await database())
      .collection<Message>("messages")
      .find({ conversationId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .toArray()
      .then((rows) => rows.reverse());
  },
  async assertActive(run) {
    if (run.expiresAt <= new Date())
      throw new AppError("TIMEOUT", "O tempo de atendimento foi excedido.");
    const conversation = await (await database())
      .collection<Conversation>("conversations")
      .findOne({ _id: run.conversationId });
    assertAgentConversation(conversation, run.customerId, run);
  },
  async handoff(run, reason, summary) {
    const db = await database();
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        const conversations = db.collection<Conversation>("conversations");
        const conversation = await conversations.findOne(
          { _id: run.conversationId },
          { session },
        );
        assertAgentConversation(conversation, run.customerId, run);
        const saved = await conversations.updateOne(
          { _id: run.conversationId, version: conversation!.version },
          {
            $set: { aiHandoff: true, updatedAt: new Date() },
            $inc: { version: 1 },
          },
          { session },
        );
        if (saved.modifiedCount !== 1)
          throw new AppError("CONFLICT", "A conversa mudou.");
        await db
          .collection<{
            _id: string;
            conversationId: string;
            actorId: string;
            operation: string;
            reason: string;
            summary: string;
            createdAt: Date;
          }>("conversation_events")
          .insertOne(
            {
              _id: randomUUID(),
              conversationId: run.conversationId,
              actorId: run.customerId,
              operation: "request_human",
              reason,
              summary,
              createdAt: new Date(),
            },
            { session },
          );
      });
    } finally {
      await session.endSession();
    }
  },
  async finish(run, text, audit, usage, code) {
    const db = await database();
    const session = db.client.startSession();
    try {
      return await session.withTransaction(async () => {
        const runs = db.collection<AgentRun>("agent_runs");
        const stored = await runs.findOne(
          { _id: run._id, state: "running" },
          { session },
        );
        if (!stored) return null;
        const conversations = db.collection<Conversation>("conversations");
        const conversation = await conversations.findOne(
          { _id: run.conversationId },
          { session },
        );
        let allowed = true;
        try {
          assertAgentConversation(conversation, run.customerId, run);
        } catch {
          allowed = false;
        }
        const message: Message | null =
          allowed && text && !code
            ? {
                _id: run.responseId,
                conversationId: run.conversationId,
                authorId: "nexo-assist",
                authorName: "Nexo Assist",
                role: "assistant",
                text,
                createdAt: new Date(),
              }
            : null;
        if (message)
          await db
            .collection<Message>("messages")
            .insertOne(message, { session });
        await runs.updateOne(
          { _id: run._id, state: "running" },
          {
            $set: {
              state: message ? "completed" : "failed",
              response: message?.text ?? null,
              completedAt: new Date(),
              errorCode: code ?? (allowed ? null : "HUMAN_CONTROL"),
              audit,
              usage,
            },
          },
          { session },
        );
        if (conversation?.aiActiveRunId === run._id) {
          await conversations.updateOne(
            {
              _id: conversation._id,
              version: conversation.version,
              aiActiveRunId: run._id,
            },
            {
              $set: { aiActiveRunId: null, updatedAt: new Date() },
              $inc: { version: 1 },
            },
            { session },
          );
        }
        return message;
      });
    } finally {
      await session.endSession();
    }
  },
};
