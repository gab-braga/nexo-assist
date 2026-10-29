import "server-only";
import type { ClientSession, Filter } from "mongodb";
import type { Conversation, Message } from "@/types/domain";
import { database } from "@/server/lib/mongodb";
import { AppError, databaseOperation } from "@/server/lib/errors";

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
