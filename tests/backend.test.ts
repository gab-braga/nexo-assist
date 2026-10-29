import { test } from "node:test";
import assert from "node:assert/strict";
import { canReadConversation, canSendMessage } from "../src/auth/policy";
import {
  ListSchema,
  MessageSchema,
  TransitionSchema,
} from "../src/server/schemas/conversations";
import type { Conversation, SessionUser } from "../src/types/domain";
import { AgentTurnSchema } from "../src/server/ai/schemas";
import { conversationTitle } from "../src/lib/conversation-title";

const customer: SessionUser = {
  uid: "customer-a",
  name: "Cliente",
  email: "a@example.test",
  role: "chat",
};
const agent: SessionUser = {
  uid: "agent-a",
  name: "Atendente",
  email: "b@example.test",
  role: "agent",
};
const conversation: Conversation = {
  _id: "b9d041ba-138b-44aa-976d-577c39acc9cf",
  customerId: customer.uid,
  customerName: customer.name,
  subject: "Preciso de ajuda",
  status: "waiting",
  agentId: null,
  agentName: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  version: 0,
};
test("customer data is isolated; all agents may follow conversations", () => {
  assert.equal(canReadConversation(customer, conversation), true);
  assert.equal(
    canReadConversation({ ...customer, uid: "other" }, conversation),
    false,
  );
  assert.equal(canReadConversation(agent, conversation), true);
  assert.equal(
    canReadConversation({ ...agent, uid: "another-agent" }, conversation),
    true,
  );
});
test("only the assigned agent may reply; customers may write while waiting", () => {
  assert.equal(canSendMessage(customer, conversation), true);
  assert.equal(canSendMessage(agent, conversation), false);
  const active = {
    ...conversation,
    status: "active" as const,
    agentId: agent.uid,
  };
  assert.equal(canSendMessage(agent, active), true);
  assert.equal(canSendMessage({ ...agent, uid: "other" }, active), false);
  assert.equal(canSendMessage({ ...customer, uid: "other" }, active), false);
});
test("closed conversations preserve history and reject every sender", () => {
  const closed = {
    ...conversation,
    status: "closed" as const,
    agentId: agent.uid,
  };
  assert.equal(canReadConversation(customer, closed), true);
  assert.equal(canSendMessage(customer, closed), false);
  assert.equal(canSendMessage(agent, closed), false);
});
test("untrusted pagination, transitions and message content are bounded", () => {
  assert.equal(ListSchema.safeParse({ limit: 100000 }).success, false);
  assert.equal(
    ListSchema.safeParse({ cursor: { date: "bad", id: conversation._id } })
      .success,
    false,
  );
  assert.equal(
    TransitionSchema.safeParse({
      conversationId: conversation._id,
      version: -1,
      operation: "assume",
    }).success,
    false,
  );
  assert.equal(
    TransitionSchema.safeParse({
      conversationId: conversation._id,
      version: 0,
      operation: "set-role",
    }).success,
    false,
  );
  assert.equal(
    MessageSchema.safeParse({
      conversationId: conversation._id,
      requestId: conversation._id,
      text: "  ",
    }).success,
    false,
  );
  assert.equal(
    MessageSchema.safeParse({
      conversationId: conversation._id,
      requestId: conversation._id,
      text: "x".repeat(8001),
    }).success,
    false,
  );
});
test("ownership and privileged fields cannot be injected via create input", () => {
  const input = {
    requestId: conversation._id,
    conversationId: conversation._id,
    startConversation: true,
    text: " Ajuda ",
  };
  assert.equal(AgentTurnSchema.safeParse({ ...input,
    customerId: "other",
    role: "agent",
    status: "closed",
  }).success, false);
  assert.equal(AgentTurnSchema.parse(input).text, "Ajuda");
  assert.equal(AgentTurnSchema.safeParse({ ...input, text: " \n " }).success, false);
  assert.equal(AgentTurnSchema.safeParse({ ...input, subject: "Título injetado" }).success, false);
});

test("automatic titles preserve short messages, normalize whitespace and bound Unicode safely", () => {
  assert.equal(conversationTitle("  Meu notebook\n  não conecta na VPN.  "), "Meu notebook não conecta na VPN.");
  assert.equal(conversationTitle("Oi"), "Oi");
  assert.equal(conversationTitle("?"), "?");
  const title = conversationTitle("word ".repeat(100));
  assert.ok(Array.from(title).length <= 80);
  assert.ok(title.endsWith("…"));
  assert.equal(conversationTitle("🙂".repeat(100)), "🙂".repeat(79) + "…");
});
