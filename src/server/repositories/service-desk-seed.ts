import "server-only";
import type { Db } from "mongodb";
import type { KnowledgeArticle, Ticket, TicketEvent } from "@/types/tickets";
import type { Conversation, Message } from "@/types/domain";
import { AppError } from "@/server/lib/errors";

export async function seedServiceDeskRecords(
  db: Db,
  articles: KnowledgeArticle[],
  tickets: Ticket[],
  history: { conversations: Conversation[]; messages: Message[] } = {
    conversations: [],
    messages: [],
  },
) {
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      for (const { _id, ...article } of articles) {
        await db
          .collection<KnowledgeArticle>("knowledge_articles")
          .updateOne(
            { _id },
            { $setOnInsert: article },
            { upsert: true, session },
          );
      }
      for (const ticket of tickets) {
        const { _id, ...fields } = ticket;
        const existing = await db
          .collection<Ticket>("tickets")
          .findOne({ _id }, { session });
        if (existing && existing.customerId !== ticket.customerId)
          throw new AppError(
            "CONFLICT",
            "Identificador de chamado de demonstração ocupado.",
          );
        const inserted = await db
          .collection<Ticket>("tickets")
          .updateOne(
            { _id },
            { $setOnInsert: fields },
            { upsert: true, session },
          );
        if (inserted.upsertedCount) {
          await db.collection<TicketEvent>("ticket_events").insertOne(
            {
              _id: `seed-${_id}`,
              ticketId: _id,
              actorId: "service-desk-demo-seed",
              operation: "create",
              reason: "Dados demonstrativos, estado inicial importado.",
              before: null,
              after: ticket,
              createdAt: ticket.createdAt,
            },
            { session },
          );
        }
      }
      for (const conversation of history.conversations) {
        const { _id, ...fields } = conversation;
        const existing = await db
          .collection<Conversation>("conversations")
          .findOne({ _id }, { session });
        if (
          existing &&
          (existing.customerId !== conversation.customerId ||
            existing.initialMessageId !== conversation.initialMessageId)
        )
          throw new AppError(
            "CONFLICT",
            "Identificador de conversa de demonstração ocupado.",
          );
        await db
          .collection<Conversation>("conversations")
          .updateOne(
            { _id },
            { $setOnInsert: fields },
            { upsert: true, session },
          );
      }
      for (const message of history.messages) {
        const { _id, ...fields } = message;
        const existing = await db
          .collection<Message>("messages")
          .findOne({ _id }, { session });
        if (
          existing &&
          (existing.conversationId !== message.conversationId ||
            existing.authorId !== message.authorId)
        )
          throw new AppError(
            "CONFLICT",
            "Identificador de mensagem de demonstração ocupado.",
          );
        await db
          .collection<Message>("messages")
          .updateOne(
            { _id },
            { $setOnInsert: fields },
            { upsert: true, session },
          );
      }
    });
  } finally {
    await session.endSession();
  }
}
