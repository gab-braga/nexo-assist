import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAgentMemory } from "../src/server/ai/memory";
import { AI_LIMITS } from "../src/server/ai/config";
import {
  conversationState,
  canProcessAgent,
} from "../src/auth/conversation-state";
import {
  ConversationContextPatchSchema,
  AgentTurnSchema,
} from "../src/server/ai/schemas";
import { HistorySchema } from "../src/server/schemas/conversations";
import { messageHistoryFilter } from "../src/server/policies/message-history";
import { messageProcessingFeedback } from "../src/lib/message-processing";
import { AppError, databaseOperation } from "../src/server/lib/errors";
import { MongoServerError } from "mongodb";
import type { Conversation, Message, MessageDTO } from "../src/types/domain";
import type { AgentMemorySnapshot } from "../src/types/ai";

const id = "a0000000-0000-4000-8000-000000000001";
const message = (
  key: string,
  text: string,
  role: Message["role"] = "chat",
): Message => ({
  _id: key,
  conversationId: id,
  authorId: "employee",
  authorName: "Employee",
  role,
  text,
  createdAt: new Date(),
});
const snapshot = (
  recentMessages: Message[],
  initialMessage: Message | null = null,
): AgentMemorySnapshot => ({
  initialMessage,
  recentMessages,
  selectedTicket: null,
  pendingOperation: null,
});

test("memory pins the original problem outside the recent window and preserves the full current message", () => {
  const original = message("initial", "Meu notebook está muito lento.");
  const recent = Array.from({ length: 20 }, (_, index) =>
    message(String(index), "Informação complementar " + index, "assistant"),
  );
  recent.push(
    message("current", "Isso começou depois da atualização do Windows."),
  );
  const memory = buildAgentMemory(snapshot(recent, original), "current");
  const json = JSON.stringify(memory);
  assert.match(json, /Meu notebook está muito lento/);
  assert.match(json, /Isso começou depois da atualização do Windows/);
  assert.deepEqual(memory.at(-1), {
    role: "user",
    content: recent.at(-1)!.text,
  });
  assert.equal(json.split(original.text).length - 1, 1);
});

test("memory bounds context without summarization calls or duplicating the initial turn", () => {
  const first = message("first", "A".repeat(8000));
  const recent = [
    first,
    ...Array.from({ length: 18 }, (_, i) =>
      message(String(i), "x".repeat(16000)),
    ),
    message("now", "B".repeat(8000)),
  ];
  const memory = buildAgentMemory(snapshot(recent, first), "now");
  const length = memory.reduce(
    (sum, entry) =>
      sum + (typeof entry.content === "string" ? entry.content.length : 0),
    0,
  );
  assert.ok(length <= AI_LIMITS.contextChars);
  assert.equal(memory.at(-1)?.content, "B".repeat(8000));
  assert.equal(buildAgentMemory(snapshot([first], first), "first").length, 1);
  assert.deepEqual(buildAgentMemory(snapshot([])), []);
});

test("pending operation and selected ticket are data, not system instructions or confirmation capabilities", () => {
  const state = snapshot([message("now", "Qual chamado estamos discutindo?")]);
  state.selectedTicket = {
    id,
    title: "Notebook lento",
    status: "open",
    version: 2,
  };
  state.pendingOperation = {
    draftId: id,
    ticketId: id,
    operation: "update",
    state: "expired",
    data: {
      title: "Notebook lento",
      description: "Informação fornecida pelo funcionário.",
      type: "INC",
      category: "Hardware",
      impact: "person",
      urgency: "workaround",
    },
  };
  const memory = buildAgentMemory(state, "now");
  assert.equal(memory[0].role, "user");
  assert.match(String(memory[0].content), /não é confirmação nem permissão/);
  assert.match(String(memory[0].content), /"state":"expired"/);
  assert.doesNotMatch(JSON.stringify(memory), /tokenHash|"token"|"digest"/);
  assert.ok(memory.every((entry) => entry.role !== "system"));
});

test("operational states map existing persisted fields and fail closed for human/closed sessions", () => {
  const conversation: Conversation = {
    _id: id,
    customerId: "employee",
    customerName: "Employee",
    subject: "Help",
    status: "waiting",
    agentId: null,
    agentName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    aiEnabled: true,
  };
  assert.equal(conversationState(conversation), "AGENT_ACTIVE");
  assert.equal(
    conversationState({ ...conversation, aiHandoff: true }),
    "WAITING_FOR_ANALYST",
  );
  assert.equal(
    conversationState({ ...conversation, aiEnabled: undefined }),
    "WAITING_FOR_ANALYST",
  );
  assert.equal(
    conversationState({ ...conversation, status: "active" }),
    "ANALYST_ACTIVE",
  );
  assert.equal(
    conversationState({ ...conversation, status: "closed" }),
    "CLOSED",
  );
  assert.equal(canProcessAgent({ ...conversation, agentId: "analyst" }), false);
});

test("public turn input cannot set security, operation, memory or counter fields", () => {
  const input = { requestId: id, conversationId: id, text: "Continuar" };
  for (const extra of [
    { customerId: "other" },
    { aiMessageCount: 0 },
    { selectedTicketId: id },
    { pendingDraftId: id },
    { status: "AGENT_ACTIVE" },
  ])
    assert.equal(
      AgentTurnSchema.safeParse({ ...input, ...extra }).success,
      false,
    );
  assert.equal(
    ConversationContextPatchSchema.safeParse({
      selectedTicketId: id,
      aiEnabled: true,
    }).success,
    false,
  );
  assert.deepEqual(
    ConversationContextPatchSchema.parse({ selectedTicketId: null }),
    { selectedTicketId: null },
  );
});

test("history keyset moves from sequence to legacy documents without revisiting newer messages", () => {
  const cursor = { id, date: "2026-10-29T13:00:00Z", sequence: 20 };
  assert.deepEqual(messageHistoryFilter(id, cursor), {
    conversationId: id,
    $or: [{ sequence: { $lt: 20 } }, { sequence: { $exists: false } }],
  });
  assert.deepEqual(messageHistoryFilter(id), { conversationId: id });
  assert.deepEqual(
    messageHistoryFilter(id, { id, date: cursor.date }).sequence,
    { $exists: false },
  );
  assert.equal(
    HistorySchema.safeParse({
      conversationId: id,
      cursor: { ...cursor, sequence: -1 },
    }).success,
    false,
  );
});

test("processing feedback distinguishes pending, failed and interrupted replies after reload", () => {
  const base: MessageDTO = {
    ...message(id, "Ajuda"),
    createdAt: new Date().toISOString(),
    runId: id,
  };
  assert.equal(
    messageProcessingFeedback({ ...base, processingState: "processing" })
      ?.error,
    false,
  );
  assert.match(
    messageProcessingFeedback({ ...base, processingState: "interrupted" })!
      .text,
    /nenhuma operação será repetida/,
  );
  assert.equal(
    messageProcessingFeedback({ ...base, processingState: "failed" })?.error,
    true,
  );
  assert.equal(
    messageProcessingFeedback({ ...base, processingState: "completed" }),
    null,
  );
  assert.equal(messageProcessingFeedback({ ...base, runId: undefined }), null);
});

test("transient persistence failure is typed and never exposes the underlying provider body", async () => {
  await assert.rejects(
    () =>
      databaseOperation(async () => {
        const error = new Error("mongodb://SECRET");
        error.name = "MongoNetworkError";
        throw error;
      }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "PERSISTENCE_UNAVAILABLE" &&
      !error.message.includes("SECRET"),
  );
  const uncertain = new MongoServerError({ message: "SECRET commit outcome" });
  uncertain.addErrorLabel("UnknownTransactionCommitResult");
  await assert.rejects(
    () =>
      databaseOperation(async () => {
        throw uncertain;
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "PERSISTENCE_UNAVAILABLE",
  );
});
