import "server-only";
import type { Db } from "mongodb";
import type { KnowledgeArticle, Ticket, TicketEvent } from "@/types/tickets";

export async function seedServiceDeskRecords(
  db: Db,
  articles: KnowledgeArticle[],
  tickets: Ticket[],
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
        const inserted = await db
          .collection<Ticket>("tickets")
          .updateOne(
            { _id },
            { $setOnInsert: fields },
            { upsert: true, session },
          );
        if (inserted.upsertedCount) {
          await db
            .collection<TicketEvent>("ticket_events")
            .insertOne(
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
    });
  } finally {
    await session.endSession();
  }
}
