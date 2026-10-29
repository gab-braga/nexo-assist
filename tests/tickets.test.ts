import { test } from "node:test";
import assert from "node:assert/strict";
import { createTicketService } from "../src/server/services/tickets";
import { AppError } from "../src/server/lib/errors";
import { checkTicketAvailability } from "../src/server/lib/ticket-availability";
import { canReopen, similarProblem, ticketDeadline, ticketPriority } from "../src/server/policies/tickets";
import { demoArticles, demoTickets } from "../src/server/data/service-desk-demo";
import type { SessionUser } from "../src/types/domain";
import type { TicketData } from "../src/types/tickets";
import { MemoryTickets } from "./helpers/ticket-memory";

const data: TicketData = { title: "VPN com erro 809", description: "Não consigo acessar os sistemas no Windows 11.", type: "INC", category: "Rede e VPN", impact: "person", urgency: "blocked" };
const customer: SessionUser = { uid: "employee-a", name: "Ana", email: "ana@example.test", role: "chat" };
function setup() {
  const repo = new MemoryTickets();
  let user: SessionUser | null = customer;
  let clock = new Date("2026-10-29T13:00:00Z");
  let outage = false;
  const service = createTicketService({ repository: repo, now: () => new Date(clock),
    authenticate: async role => {
      if (!user) throw new AppError("UNAUTHENTICATED", "Login required");
      if (role && user.role !== role) throw new AppError("FORBIDDEN", "Forbidden");
      return user;
    },
    available: () => { if (outage) throw new AppError("TEMPORARILY_UNAVAILABLE", "Try again"); },
  });
  return { repo, service, as: (value: SessionUser | null) => { user = value; }, at: (value: string) => { clock = new Date(value); }, outage: (value: boolean) => { outage = value; } };
}
const code = (expected: string) => (error: unknown) => error instanceof AppError && error.code === expected;
async function create(f: ReturnType<typeof setup>, fields: TicketData = data) {
  const draft = await f.service.prepareTicketChange({ operation: "create", data: fields });
  return f.service.confirmTicketChange({ draftId: draft.draftId, digest: draft.digest, token: draft.token });
}

test("priority covers impact/urgency and critical precedence", () => {
  assert.equal(ticketPriority({ impact: "team", urgency: "blocked" }), "critical");
  assert.equal(ticketPriority({ impact: "company", urgency: "blocked" }), "critical");
  assert.equal(ticketPriority({ impact: "person", urgency: "blocked" }), "high");
  assert.equal(ticketPriority({ impact: "team", urgency: "today" }), "high");
  assert.equal(ticketPriority({ impact: "person", urgency: "workaround" }), "medium");
  assert.equal(ticketPriority({ impact: "person", urgency: "normal" }), "low");
});
test("SLA skips weekends, preserves minutes and uses 24/7 for critical", () => {
  assert.equal(ticketDeadline(new Date("2026-10-30T20:30:00Z"), "high").toISOString(), "2026-11-02T14:30:00.000Z");
  assert.equal(ticketDeadline(new Date("2026-10-31T20:30:00Z"), "critical").toISOString(), "2026-10-31T21:30:00.000Z");
  assert.equal(ticketDeadline(new Date("2026-10-29T10:00:00Z"), "high").toISOString(), "2026-10-29T15:00:00.000Z");
  assert.equal(ticketDeadline(new Date("2026-10-29T11:00:00Z"), "medium").toISOString(), "2026-11-02T21:00:00.000Z");
  assert.equal(ticketDeadline(new Date("2026-10-29T11:00:00Z"), "low").toISOString(), "2026-11-04T21:00:00.000Z");
});
test("preparation does not write tickets; confirmation persists authoritative employee and event", async () => {
  const f = setup();
  const draft = await f.service.prepareTicketChange({ operation: "create", data });
  assert.equal(f.repo.tickets.size, 0);
  const ticket = await f.service.confirmTicketChange({ draftId: draft.draftId, digest: draft.digest, token: draft.token });
  assert.equal(ticket.customerId, customer.uid);
  assert.equal(ticket.priority, "high");
  assert.equal(ticket.version, 0);
  assert.equal((await f.service.getTicketHistory(ticket._id)).length, 1);
});
test("invalid fields, forged ownership, priority and simple confirmed flag are rejected", async () => {
  const f = setup();
  for (const invalid of [{ ...data, title: "" }, { ...data, type: "OTHER" }, { ...data, category: "RH" }, { ...data, description: "" }, { ...data, customerId: "other" }, { ...data, priority: "low" }])
    await assert.rejects(() => f.service.prepareTicketChange({ operation: "create", data: invalid }));
  await assert.rejects(() => f.service.confirmTicketChange({ confirmed: true }));
  assert.equal(f.repo.tickets.size, 0);
});
test("confirmation is bound to owner, token and digest and expires", async () => {
  const f = setup();
  const draft = await f.service.prepareTicketChange({ operation: "create", data });
  const confirmation = { draftId: draft.draftId, digest: draft.digest, token: draft.token };
  f.as({ ...customer, uid: "employee-b" });
  await assert.rejects(() => f.service.confirmTicketChange(confirmation), code("NOT_FOUND"));
  f.as(customer);
  await assert.rejects(() => f.service.confirmTicketChange({ ...confirmation, token: "0".repeat(64) }), code("INVALID_CONFIRMATION"));
  await assert.rejects(() => f.service.confirmTicketChange({ ...confirmation, digest: "0".repeat(64) }), code("INVALID_CONFIRMATION"));
  f.at("2026-10-29T13:30:00Z");
  await assert.rejects(() => f.service.confirmTicketChange(confirmation), code("CONFIRMATION_EXPIRED"));
});
test("replay and simultaneous confirmations return one persisted receipt/event", async () => {
  const f = setup();
  const draft = await f.service.prepareTicketChange({ operation: "create", data });
  const input = { draftId: draft.draftId, token: draft.token, digest: draft.digest };
  const results = await Promise.all([f.service.confirmTicketChange(input), f.service.confirmTicketChange(input)]);
  assert.equal(results[0]._id, results[1]._id);
  assert.equal(f.repo.tickets.size, 1);
  assert.equal(f.repo.history.length, 1);
});
test("employees cannot read/update/list another owner's tickets; analyst reads only allowed endpoints", async () => {
  const f = setup();
  const ticket = await create(f);
  f.as({ ...customer, uid: "employee-b" });
  assert.equal((await f.service.listMyTickets()).items.length, 0);
  await assert.rejects(() => f.service.getTicket(ticket._id), code("NOT_FOUND"));
  await assert.rejects(() => f.service.getTicketHistory(ticket._id), code("NOT_FOUND"));
  await assert.rejects(() => f.service.prepareTicketChange({ operation: "update", ticketId: ticket._id, version: 0, data }), code("NOT_FOUND"));
  await assert.rejects(() => f.service.listAdministrativeTickets(), code("FORBIDDEN"));
  f.as({ ...customer, uid: "analyst", role: "agent" });
  assert.equal((await f.service.listAdministrativeTickets({ customerId: customer.uid })).items.length, 1);
  assert.equal((await f.service.getTicket(ticket._id))._id, ticket._id);
  await assert.rejects(() => f.service.prepareTicketChange({ operation: "create", data }), code("FORBIDDEN"));
  f.as(null);
  await assert.rejects(() => f.service.getTicket(ticket._id), code("UNAUTHENTICATED"));
});
test("duplicates normalize accents/punctuation and are checked again at commit across drafts", async () => {
  const f = setup();
  assert.equal(similarProblem(data, { ...data, title: "VＰN" }), false);
  const first = await f.service.prepareTicketChange({ operation: "create", data });
  const second = await f.service.prepareTicketChange({ operation: "create", data: { ...data, title: "vpn com érro 809!" } });
  const outcomes = await Promise.allSettled([first, second].map(draft => f.service.confirmTicketChange({ draftId: draft.draftId, digest: draft.digest, token: draft.token })));
  assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1);
  assert.equal(f.repo.tickets.size, 1);
  assert.equal((await f.service.findPossibleDuplicates(data)).length, 1);
  f.as({ ...customer, uid: "employee-b" });
  assert.equal((await f.service.findPossibleDuplicates(data)).length, 0);
  await create(f);
  assert.equal(f.repo.tickets.size, 2);
});
test("updates require their own confirmation, reject stale versions and do not reset SLA", async () => {
  const f = setup();
  const ticket = await create(f);
  f.at("2026-10-29T18:00:00Z");
  const input = { operation: "update", ticketId: ticket._id, version: 0, data: { ...data, description: "Informação adicional: erro persiste após reiniciar." } };
  const draft = await f.service.prepareTicketChange(input);
  const stale = await f.service.prepareTicketChange(input);
  assert.equal((await f.service.getTicket(ticket._id)).description, data.description);
  const updated = await f.service.confirmTicketChange({ draftId: draft.draftId, digest: draft.digest, token: draft.token });
  assert.equal(updated.version, 1);
  assert.equal(updated.nextResponseDueAt, ticket.nextResponseDueAt);
  assert.equal(updated.overdue, true);
  assert.equal((await f.service.listMyTickets({ overdue: true })).items.length, 1);
  await assert.rejects(() => f.service.confirmTicketChange({ draftId: stale.draftId, digest: stale.digest, token: stale.token }), code("CONFLICT"));
});
test("reopening allows exactly seven days, rechecks at commit and requires resolved status", async () => {
  const f = setup();
  const ticket = await create(f);
  await assert.rejects(() => f.service.prepareTicketChange({ operation: "reopen", ticketId: ticket._id, version: 0 }), code("REOPEN_WINDOW_EXPIRED"));
  f.as({ ...customer, role: "agent" });
  await f.service.resolveTicket({ ticketId: ticket._id, version: 0, reason: "Suporte restabeleceu o acesso" });
  f.as(customer);
  f.at("2026-11-05T13:00:00Z");
  assert.equal(canReopen({ status: "resolved", resolvedAt: new Date("2026-10-29T13:00:00Z") }, new Date("2026-11-05T13:00:00Z")), true);
  const draft = await f.service.prepareTicketChange({ operation: "reopen", ticketId: ticket._id, version: 1 });
  f.at("2026-11-05T13:00:00.001Z");
  await assert.rejects(() => f.service.confirmTicketChange({ draftId: draft.draftId, digest: draft.digest, token: draft.token }), code("REOPEN_WINDOW_EXPIRED"));
  f.at("2026-11-04T13:00:00Z");
  const allowed = await f.service.prepareTicketChange({ operation: "reopen", ticketId: ticket._id, version: 1 });
  const reopened = await f.service.confirmTicketChange({ draftId: allowed.draftId, digest: allowed.digest, token: allowed.token });
  assert.equal(reopened.status, "open");
  assert.equal(reopened.resolvedAt, null);
  assert.equal(reopened.lastServiceUpdateAt, "2026-11-04T13:00:00.000Z");
});
test("handoff is confirmed, persists reason and preserves deadline; employees cannot resolve", async () => {
  const f = setup();
  const ticket = await create(f);
  const draft = await f.service.prepareTicketChange({ operation: "handoff", ticketId: ticket._id, version: 0, reason: "Funcionário solicita atendimento humano" });
  assert.equal((await f.service.getTicket(ticket._id)).status, "open");
  const transferred = await f.service.confirmTicketChange({ draftId: draft.draftId, digest: draft.digest, token: draft.token });
  assert.equal(transferred.status, "waiting_human");
  assert.equal(transferred.nextResponseDueAt, ticket.nextResponseDueAt);
  assert.equal(f.repo.history.at(-1)?.reason, "Funcionário solicita atendimento humano");
  await assert.rejects(() => f.service.resolveTicket({ ticketId: ticket._id, version: 1, reason: "Resolvido" }), code("FORBIDDEN"));
});
test("temporary outage and rollback preserve pending confirmation; post-commit retry is idempotent", async () => {
  const f = setup();
  const draft = await f.service.prepareTicketChange({ operation: "create", data });
  const input = { draftId: draft.draftId, digest: draft.digest, token: draft.token };
  f.outage(true);
  await assert.rejects(() => f.service.confirmTicketChange(input), code("TEMPORARILY_UNAVAILABLE"));
  assert.equal(f.repo.tickets.size, 0);
  f.outage(false);
  f.repo.failEvent = true;
  await assert.rejects(() => f.service.confirmTicketChange(input));
  assert.equal(f.repo.tickets.size, 0);
  assert.equal(f.repo.drafts.get(draft.draftId)?.appliedAt, null);
  f.repo.failEvent = false;
  const saved = await f.service.confirmTicketChange(input);
  // Simulates a caller losing the successful response and retrying later.
  assert.equal((await f.service.confirmTicketChange(input))._id, saved._id);
  assert.equal(f.repo.history.length, 1);
});
test("server-only outage switch is deterministic", () => {
  const previous = process.env.TICKET_SERVICE_UNAVAILABLE_UNTIL;
  try {
    process.env.TICKET_SERVICE_UNAVAILABLE_UNTIL = new Date(Date.now() + 60000).toISOString();
    assert.throws(checkTicketAvailability, code("TEMPORARILY_UNAVAILABLE"));
    process.env.TICKET_SERVICE_UNAVAILABLE_UNTIL = "2000-01-01T00:00:00Z";
    assert.doesNotThrow(checkTicketAvailability);
  } finally {
    if (previous === undefined) delete process.env.TICKET_SERVICE_UNAVAILABLE_UNTIL;
    else process.env.TICKET_SERVICE_UNAVAILABLE_UNTIL = previous;
  }
});
test("demo data covers PRD categories, types, priorities and employee isolation", () => {
  const rows = demoTickets(new Date("2026-10-29T13:00:00Z"));
  assert.equal(demoArticles.length, 6);
  assert.equal(new Set(rows.map(ticket => ticket.customerId)).size, 2);
  assert.deepEqual(new Set(rows.map(ticket => ticket.type)), new Set(["INC", "REQ"]));
  assert.equal(new Set(rows.map(ticket => ticket.priority)).size, 4);
  assert.ok(rows.some(ticket => ticket.status === "resolved" && canReopen(ticket, new Date("2026-10-29T13:00:00Z"))));
  assert.ok(rows.some(ticket => ticket.status !== "resolved" && ticket.nextResponseDueAt < new Date("2026-10-29T13:00:00Z")));
});
