import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import type { Conversation, Message, SessionUser } from "../src/types/domain";
import type {
  Ticket,
  TicketEvent,
  KnowledgeArticle,
} from "../src/types/tickets";
loadEnvConfig(process.cwd());

async function main() {
  const { database } = await import("../src/server/lib/mongodb");
  const { seedServiceDeskRecords } =
    await import("../src/server/repositories/service-desk-seed");
  const { demoArticles, demoConversations, demoTickets } =
    await import("../src/server/data/service-desk-demo");
  const { appendMessage } =
    await import("../src/server/repositories/conversations");
  const { findKnowledgeArticles } =
    await import("../src/server/repositories/knowledge");
  const { ticketDeadline } = await import("../src/server/policies/tickets");
  const { canSendMessage, canReadConversation } =
    await import("../src/auth/policy");
  const { AppError } = await import("../src/server/lib/errors");
  const db = await database();
  const namespace = `final-validation-${randomUUID()}`;
  const now = new Date();
  const ticketIds = new Map(
    demoTickets(now).map((ticket) => [ticket._id, randomUUID()]),
  );
  const source = demoConversations(now);
  const conversationIds = new Map(
    source.conversations.map((conversation) => [
      conversation._id,
      randomUUID(),
    ]),
  );
  const messageIds = new Map(
    source.messages.map((message) => [message._id, randomUUID()]),
  );
  const tickets = demoTickets(now).map((ticket) => ({
    ...ticket,
    _id: ticketIds.get(ticket._id)!,
    customerId: `${namespace}:${ticket.customerId}`,
  }));
  const articles = demoArticles.map((article) => ({
    ...article,
    _id: `${namespace}-${article._id}`,
    keywords: [...article.keywords, namespace],
  }));
  const conversations: Conversation[] = source.conversations.map(
    (conversation) => ({
      ...conversation,
      _id: conversationIds.get(conversation._id)!,
      customerId: `${namespace}:${conversation.customerId}`,
      agentId: conversation.agentId
        ? `${namespace}:${conversation.agentId}`
        : null,
      initialMessageId: messageIds.get(conversation.initialMessageId!)!,
      selectedTicketId: conversation.selectedTicketId
        ? ticketIds.get(conversation.selectedTicketId)!
        : null,
    }),
  );
  const messages: Message[] = source.messages.map((message) => ({
    ...message,
    _id: messageIds.get(message._id)!,
    conversationId: conversationIds.get(message.conversationId)!,
    authorId: `${namespace}:${message.authorId}`,
  }));
  const history = { conversations, messages };
  const active = conversations.find(
    (conversation) => conversation.status === "active",
  )!;
  const analyst: SessionUser = {
    uid: active.agentId!,
    name: "Analista temporário",
    email: "test@example.test",
    role: "agent",
  };
  const employee: SessionUser = {
    uid: active.customerId,
    name: active.customerName,
    email: "test@example.test",
    role: "chat",
  };
  async function send(
    actor: SessionUser,
    id: string,
    text: string,
    messageId = randomUUID(),
  ) {
    const message: Message = {
      _id: messageId,
      conversationId: id,
      authorId: actor.uid,
      authorName: actor.name,
      role: actor.role,
      text,
      createdAt: new Date(),
    };
    await appendMessage(message, (conversation, existing) => {
      if (
        !conversation ||
        !canReadConversation(actor, conversation) ||
        (existing
          ? existing.conversationId !== id ||
            existing.authorId !== actor.uid ||
            existing.text !== text
          : !canSendMessage(actor, conversation))
      )
        throw new AppError("FORBIDDEN", "Denied");
    });
    return message;
  }
  try {
    await seedServiceDeskRecords(db, articles, tickets, history);
    await db
      .collection<Conversation>("conversations")
      .updateOne(
        { _id: active._id },
        { $set: { subject: "Alteração preservada pelo seed" } },
      );
    await seedServiceDeskRecords(db, articles, tickets, history);
    assert.equal(
      await db
        .collection<Conversation>("conversations")
        .countDocuments({
          _id: { $in: conversations.map((conversation) => conversation._id) },
        }),
      4,
    );
    assert.equal(
      (
        await db
          .collection<Conversation>("conversations")
          .findOne({ _id: active._id })
      )?.subject,
      "Alteração preservada pelo seed",
    );
    const found = await findKnowledgeArticles("conexão remota");
    assert.ok(
      found.some((article) => article._id === `${namespace}-demo-vpn-809`),
    );
    assert.ok(
      (await findKnowledgeArticles("horario expediente")).some(
        (article) => article._id === `${namespace}-demo-hours`,
      ),
    );
    const before = await db
      .collection<Ticket>("tickets")
      .findOne({ _id: active.selectedTicketId! });
    assert.ok(before);
    await send(employee, active._id, "Acrescentei mais uma informação.");
    assert.equal(
      (
        await db.collection<Ticket>("tickets").findOne({ _id: before._id })
      )?.nextResponseDueAt.toISOString(),
      before.nextResponseDueAt.toISOString(),
    );
    const requestId = randomUUID();
    const sent = await Promise.all([
      send(
        analyst,
        active._id,
        "A análise foi iniciada; retornaremos com o resultado.",
        requestId,
      ),
      send(
        analyst,
        active._id,
        "A análise foi iniciada; retornaremos com o resultado.",
        requestId,
      ),
    ]);
    const after = await db
      .collection<Ticket>("tickets")
      .findOne({ _id: before._id });
    assert.ok(after);
    assert.equal(after.version, before.version + 1);
    assert.ok(after.lastServiceUpdateAt >= sent[0].createdAt);
    assert.equal(
      after.nextResponseDueAt.toISOString(),
      ticketDeadline(after.lastServiceUpdateAt, after.priority).toISOString(),
    );
    assert.equal(
      await db
        .collection<TicketEvent>("ticket_events")
        .countDocuments({ ticketId: before._id, operation: "service_update" }),
      1,
    );
    await send(
      analyst,
      active._id,
      "A análise foi iniciada; retornaremos com o resultado.",
      requestId,
    );
    assert.equal(
      (await db.collection<Ticket>("tickets").findOne({ _id: before._id }))
        ?.version,
      after.version,
    );
    await assert.rejects(() =>
      send(
        { ...analyst, uid: `${namespace}:foreign` },
        active._id,
        "Não autorizado",
      ),
    );
    const failedId = randomUUID();
    await db
      .collection<TicketEvent>("ticket_events")
      .insertOne({
        _id: `response:${failedId}`,
        ticketId: before._id,
        actorId: analyst.uid,
        operation: "service_update",
        reason: "Collision fixture",
        before,
        after,
        createdAt: now,
      });
    await assert.rejects(() =>
      send(analyst, active._id, "Esta mensagem deve fazer rollback.", failedId),
    );
    assert.equal(
      await db
        .collection<Message>("messages")
        .countDocuments({ _id: failedId }),
      0,
    );
    assert.equal(
      (await db.collection<Ticket>("tickets").findOne({ _id: before._id }))
        ?.version,
      after.version,
    );
    await assert.rejects(() =>
      seedServiceDeskRecords(
        db,
        [],
        [{ ...tickets[0], customerId: `${namespace}:collision` }],
      ),
    );
    assert.equal(
      (await db.collection<Ticket>("tickets").findOne({ _id: tickets[0]._id }))
        ?.customerId,
      tickets[0].customerId,
    );
    console.log(
      "Final database validation passed: isolated idempotent demo fixtures, lexical knowledge search, employee SLA preservation, atomic human service updates, concurrent/replayed messages, ownership, rollback and seed collision protection.",
    );
  } finally {
    const ids = conversations.map((conversation) => conversation._id);
    await db
      .collection<Message>("messages")
      .deleteMany({ conversationId: { $in: ids } });
    await db
      .collection("conversation_events")
      .deleteMany({ conversationId: { $in: ids } });
    await db
      .collection<Conversation>("conversations")
      .deleteMany({
        _id: { $in: ids },
        customerId: {
          $in: conversations.map((conversation) => conversation.customerId),
        },
      });
    await db
      .collection<TicketEvent>("ticket_events")
      .deleteMany({ ticketId: { $in: tickets.map((ticket) => ticket._id) } });
    await db
      .collection<Ticket>("tickets")
      .deleteMany({
        _id: { $in: tickets.map((ticket) => ticket._id) },
        customerId: { $in: tickets.map((ticket) => ticket.customerId) },
      });
    await db
      .collection<KnowledgeArticle>("knowledge_articles")
      .deleteMany({ _id: { $in: articles.map((article) => article._id) } });
    await db.client.close();
  }
}
main().catch((error) => {
  console.error(
    "Final database validation failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});
