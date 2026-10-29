import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SessionUser } from "../src/types/domain";
import type { KnowledgeArticle, Ticket, TicketData, TicketDraft, TicketEvent } from "../src/types/tickets";
loadEnvConfig(process.cwd());

async function main() {
  const { database } = await import("../src/server/lib/mongodb");
  const { ticketRepository } = await import("../src/server/repositories/tickets");
  const { createTicketService } = await import("../src/server/services/tickets");
  const { seedServiceDeskRecords } = await import("../src/server/repositories/service-desk-seed");
  const { findKnowledgeArticle, findKnowledgeArticles } = await import("../src/server/repositories/knowledge");
  const { AppError } = await import("../src/server/lib/errors");
  const db = await database();
  const namespace = `ticket-test-${randomUUID()}`;
  const owners = [`${namespace}-a`, `${namespace}-b`];
  let actor: SessionUser = { uid: owners[0], name: "Temporary test", email: "test@example.test", role: "chat" };
  const data: TicketData = { title: `VPN ${namespace}`, description: "Temporary database integration record, safe to delete.", type: "INC", category: "Rede e VPN", impact: "person", urgency: "blocked" };
  const services = () => createTicketService({ repository: ticketRepository, now: () => new Date(), available: () => {}, authenticate: async role => {
    if (role && actor.role !== role) throw new AppError("FORBIDDEN", "Denied");
    return actor;
  } });
  const articles: KnowledgeArticle[] = [{ _id: namespace, title: namespace, content: "Windows 10 only", keywords: [`keyword-${namespace}`], applicability: ["Windows 10"], category: "Software", version: 1 }];
  let firstId: string | undefined;
  try {
    const service = services();
    const draft = await service.prepareTicketChange({ operation: "create", data });
    const input = { draftId: draft.draftId, digest: draft.digest, token: draft.token };
    const ticket = await service.confirmTicketChange(input);
    firstId = ticket._id;
    assert.equal((await services().getTicket(ticket._id)).title, data.title); // fresh service, persisted context
    assert.equal((await services().confirmTicketChange(input))._id, ticket._id);
    assert.equal(await db.collection<TicketEvent>("ticket_events").countDocuments({ ticketId: ticket._id }), 1);
    actor = { ...actor, uid: owners[1] };
    await assert.rejects(() => service.getTicket(ticket._id), (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND");
    assert.equal((await service.listMyTickets()).items.length, 0);
    actor = { ...actor, uid: owners[0] };
    const proposals = await Promise.all([1, 2].map(() => service.prepareTicketChange({ operation: "create", data: { ...data, category: "Software", title: `Software ${namespace}` } })));
    const outcomes = await Promise.allSettled(proposals.map(proposal => service.confirmTicketChange({ draftId: proposal.draftId, digest: proposal.digest, token: proposal.token })));
    assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1);
    assert.equal(await db.collection<Ticket>("tickets").countDocuments({ customerId: owners[0] }), 2);

    // A repository failure after updating the ticket must roll back ticket + event.
    const before = await ticketRepository.getTicket(ticket._id);
    assert.ok(before);
    await assert.rejects(() => ticketRepository.transaction(async tx => {
      await tx.lockCustomer(owners[0]);
      await tx.saveTicket({ ...before, version: before.version + 1, description: "MUST ROLL BACK" }, before.version);
      throw new Error("Injected failure before commit");
    }));
    assert.equal((await ticketRepository.getTicket(ticket._id))?.description, before.description);

    const seedTicket: Ticket = { ...before, _id: randomUUID(), number: `INC-${namespace}`, title: "Preserve original seed record" };
    await seedServiceDeskRecords(db, articles, [seedTicket]);
    await seedServiceDeskRecords(db, [{ ...articles[0], content: "MUST NOT OVERWRITE" }], [{ ...seedTicket, description: "MUST NOT OVERWRITE" }]);
    assert.equal((await ticketRepository.getTicket(seedTicket._id))?.description, before.description);
    assert.equal((await findKnowledgeArticle(namespace))?.content, "Windows 10 only");
    assert.equal((await findKnowledgeArticles(`keyword-${namespace}`)).length, 1);
    assert.equal((await findKnowledgeArticles("MUST NOT OVERWRITE")).some(article => article._id === namespace), false);
    assert.equal(await db.collection<TicketEvent>("ticket_events").countDocuments({ ticketId: seedTicket._id }), 1);
    console.log("Ticket database integration passed: persistence, authorization, replay, concurrent duplicate prevention, rollback, knowledge search and non-destructive seed.");
  } finally {
    // Only this run's generated owner namespace and article ID may be removed.
    const rows = await db.collection<Ticket>("tickets").find({ customerId: { $in: owners } }).toArray();
    const ids = rows.map(row => row._id);
    if (firstId && !ids.includes(firstId)) ids.push(firstId);
    await db.collection<TicketEvent>("ticket_events").deleteMany({ ticketId: { $in: ids } });
    await db.collection<TicketDraft>("ticket_drafts").deleteMany({ customerId: { $in: owners } });
    await db.collection<Ticket>("tickets").deleteMany({ customerId: { $in: owners } });
    await db.collection<{ _id: string }>("ticket_customer_locks").deleteMany({ _id: { $in: owners } });
    await db.collection<KnowledgeArticle>("knowledge_articles").deleteOne({ _id: namespace });
    await db.client.close();
  }
}
main().catch(error => {
  if (error instanceof assert.AssertionError) console.error(error.message, error.stack);
  console.error("Ticket database integration failed:", error instanceof Error ? error.name : "UnknownError");
  process.exitCode = 1;
});
