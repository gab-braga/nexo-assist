import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
loadEnvConfig(process.cwd());

async function main() {
  const { database } = await import("../src/server/lib/mongodb");
  const {
    createConversationRecord,
    findConversation,
    appendMessage,
    transitionRecord,
    conversationCollections,
  } = await import("../src/server/repositories/conversations");
  const { canSendMessage } = await import("../src/auth/policy");
  const { AppError } = await import("../src/server/lib/errors");
  const db = await database();
  const id = randomUUID();
  const customer = {
    uid: `test-${id}`,
    name: "Integration test",
    email: "integration@example.test",
    role: "chat" as const,
  };
  const messageId = randomUUID();
  const now = new Date();
  const collections = await conversationCollections();
  try {
    await createConversationRecord({
      _id: id,
      customerId: customer.uid,
      customerName: customer.name,
      subject: "Temporary integration test",
      status: "waiting",
      agentId: null,
      agentName: null,
      createdAt: now,
      updatedAt: now,
      version: 0,
    });
    assert.equal((await findConversation(id))?.customerId, customer.uid);
    const message = {
      _id: messageId,
      conversationId: id,
      authorId: customer.uid,
      authorName: customer.name,
      role: "chat" as const,
      text: "Temporary test message",
      createdAt: new Date(),
    };
    const authorize: Parameters<typeof appendMessage>[1] = (conversation) => {
      if (!conversation || !canSendMessage(customer, conversation))
        throw new AppError("FORBIDDEN", "Denied");
    };
    await appendMessage(message, authorize);
    await appendMessage(message, authorize);
    assert.equal(
      await collections.messages.countDocuments({ _id: messageId }),
      1,
    );
    assert.equal((await findConversation(id))?.version, 1);
    const outcomes = await Promise.allSettled(
      ["test-agent-a", "test-agent-b"].map((agentId) =>
        transitionRecord(
          { _id: id, version: 1, status: "waiting", agentId: null },
          {
            status: "active",
            agentId,
            agentName: agentId,
            updatedAt: new Date(),
          },
          {
            _id: randomUUID(),
            conversationId: id,
            actorId: agentId,
            operation: "assume",
            createdAt: new Date(),
          },
        ),
      ),
    );
    assert.equal(
      outcomes.filter((outcome) => outcome.status === "fulfilled").length,
      1,
    );
    assert.equal(
      await collections.events.countDocuments({ conversationId: id }),
      1,
    );
    const active = (await findConversation(id))!;
    await transitionRecord(
      { _id: id, version: active.version, agentId: active.agentId },
      {
        status: "closed",
        agentId: active.agentId,
        agentName: active.agentName,
        updatedAt: new Date(),
      },
      {
        _id: randomUUID(),
        conversationId: id,
        actorId: active.agentId!,
        operation: "close",
        createdAt: new Date(),
      },
    );
    await assert.rejects(() =>
      appendMessage({ ...message, _id: randomUUID() }, authorize),
    );
    assert.equal(
      await collections.messages.countDocuments({ conversationId: id }),
      1,
    );
    console.log(
      "Database integration passed: persistence, idempotency, concurrent assignment, closed state and rollback.",
    );
  } finally {
    // Delete only documents owned by this test's fresh UUID.
    await collections.messages.deleteMany({ conversationId: id });
    await collections.events.deleteMany({ conversationId: id });
    await collections.conversations.deleteOne({
      _id: id,
      customerId: customer.uid,
    });
    await db.client.close();
  }
}
main().catch((error) => {
  console.error(
    "Database integration failed:",
    error.codeName || error.name,
    error.message?.replace(/mongodb:\/\/[^\s]+/g, "[redacted]"),
  );
  process.exitCode = 1;
});
