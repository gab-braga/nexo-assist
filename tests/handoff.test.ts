import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analystTransition,
  buildHandoffSummary,
} from "../src/server/policies/handoff";
import { assertAgentConversation } from "../src/server/repositories/agent-runs";
import { TransitionSchema } from "../src/server/schemas/conversations";
import { conversationState } from "../src/auth/conversation-state";
import type { Conversation, Message, SessionUser } from "../src/types/domain";
import type { AgentRun } from "../src/types/ai";
import { MemoryTickets } from "./helpers/ticket-memory";
import { createTicketService } from "../src/server/services/tickets";
import { createNexoTools } from "../src/server/ai/tools";
import { NexoRunContext } from "../src/server/ai/context";
import { RequestContext } from "@mastra/core/request-context";

const analyst: SessionUser = {
  uid: "analyst-a",
  name: "Analista",
  role: "agent",
  email: "test@example.test",
};
const conversation: Conversation = {
  _id: "10000000-0000-4000-8000-000000000001",
  customerId: "employee",
  customerName: "Ana",
  subject: "VPN não conecta",
  status: "waiting",
  aiEnabled: true,
  aiHandoff: true,
  agentId: null,
  agentName: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  version: 2,
};
test("analyst transitions authorize the assignee and preserve queue release separately from return to AI", () => {
  const assumed = {
    ...conversation,
    ...analystTransition(analyst, conversation, "assume"),
  };
  assert.equal(conversationState(assumed), "ANALYST_ACTIVE");
  assert.ok(assumed.assignedAt);
  const resumed = {
    ...assumed,
    ...analystTransition(analyst, assumed, "return_to_ai"),
  };
  assert.equal(conversationState(resumed), "AGENT_ACTIVE");
  assert.equal(resumed.agentId, null);
  assert.ok(resumed.returnedAt);
  assert.equal(
    conversationState({
      ...assumed,
      ...analystTransition(analyst, assumed, "release"),
    }),
    "WAITING_FOR_ANALYST",
  );
  assert.equal(
    conversationState({
      ...assumed,
      ...analystTransition(analyst, assumed, "close"),
    }),
    "CLOSED",
  );
  for (const operation of ["release", "return_to_ai", "close"] as const) {
    assert.throws(() =>
      analystTransition({ ...analyst, uid: "other" }, assumed, operation),
    );
    assert.throws(() => analystTransition(analyst, conversation, operation));
  }
  assert.throws(() =>
    analystTransition({ ...analyst, role: "chat" }, conversation, "assume"),
  );
  assert.throws(() =>
    analystTransition(analyst, { ...conversation, status: "closed" }, "assume"),
  );
});
test("an old run cannot bypass the human fence even while waiting or after return to AI", () => {
  const run = {
    _id: "run",
    customerId: conversation.customerId,
    controlVersion: 0,
  } as AgentRun;
  assert.throws(() =>
    assertAgentConversation(
      { ...conversation, aiActiveRunId: "run", aiControlVersion: 0 },
      conversation.customerId,
      run,
    ),
  );
  assert.throws(() =>
    assertAgentConversation(
      {
        ...conversation,
        aiHandoff: false,
        aiActiveRunId: "new-run",
        aiControlVersion: 2,
      },
      conversation.customerId,
      run,
    ),
  );
});
test("summary is bounded, scopes messages to the conversation and omits common credential fields", () => {
  const message = (id: string, text: string): Message => ({
    _id: id,
    conversationId: conversation._id,
    authorId: conversation.customerId,
    authorName: "Ana",
    role: "chat",
    text,
    createdAt: new Date(),
  });
  const summary = buildHandoffSummary(
    conversation,
    "senha: SECRET token=SECRET Authorization: Bearer SECRET",
    [
      message("own", "VPN com erro 809"),
      { ...message("foreign", "FOREIGN DATA"), conversationId: "other" },
    ],
  );
  assert.ok(!JSON.stringify(summary).includes("SECRET"));
  assert.ok(!JSON.stringify(summary).includes("FOREIGN DATA"));
  assert.equal(summary.information[0], "VPN com erro 809");
  assert.equal(
    buildHandoffSummary(conversation, "x".repeat(4000)).agentNote.length,
    1000,
  );
});
test("transition requests accept a replay ID and cannot supply privileged state", () => {
  const valid = {
    requestId: conversation._id,
    conversationId: conversation._id,
    version: 2,
    operation: "return_to_ai",
  };
  assert.equal(TransitionSchema.safeParse(valid).success, true);
  for (const field of [
    "agentId",
    "aiEnabled",
    "aiControlVersion",
    "customerId",
  ])
    assert.equal(
      TransitionSchema.safeParse({ ...valid, [field]: "forged" }).success,
      false,
    );
});

test("a resolved critical ticket can be consulted without treating historical priority as a new active emergency", async () => {
  const employee: SessionUser = { ...analyst, uid: "employee", role: "chat" };
  let actor = employee;
  const tickets = createTicketService({
    repository: new MemoryTickets(),
    authenticate: async () => actor,
    now: () => new Date(),
    available: () => {},
  });
  const draft = await tickets.prepareTicketChange({
    operation: "create",
    data: {
      title: "Rede da equipe parada",
      description: "Toda a equipe está sem acesso à rede e sem alternativa.",
      type: "INC",
      category: "Rede e VPN",
      impact: "team",
      urgency: "blocked",
    },
  });
  const ticket = await tickets.confirmTicketChange({
    draftId: draft.draftId,
    digest: draft.digest,
    token: draft.token,
  });
  actor = analyst;
  await tickets.resolveTicket({
    ticketId: ticket._id,
    version: ticket.version,
    reason: "Rede normalizada.",
  });
  actor = employee;
  let transfers = 0;
  const scope = new NexoRunContext(
    employee.uid,
    conversation._id,
    "test-run",
    new AbortController().signal,
    async () => employee,
    async () => {},
    async () => {
      transfers++;
    },
    async () => {},
  );
  const requestContext = new RequestContext();
  requestContext.set("nexo", scope);
  const result = await createNexoTools({ tickets, knowledge: async () => [] })
    .getTicketStatus.execute!(
    { ticketId: ticket._id, rationale: "Consultar chamado já resolvido." },
    { requestContext },
  );
  assert.ok(result && "ok" in result && result.ok);
  assert.equal(transfers, 0);
  assert.ok(JSON.stringify(result).includes('"handoffReason":null'));
});
