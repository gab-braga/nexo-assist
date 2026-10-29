import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { database } = await import("../src/server/lib/mongodb");
  const db = await database();
  try {
    await db.command({ ping: 1 });
    const indexes = [
      ["users", { _id: 1 }],
      ["conversations", { _id: 1 }],
      ["conversations", { updatedAt: -1, _id: -1 }],
      ["conversations", { customerId: 1, updatedAt: -1, _id: -1 }],
      ["conversations", { status: 1, updatedAt: -1, _id: -1 }],
      ["conversations", { agentId: 1, updatedAt: -1, _id: -1 }],
      ["messages", { _id: 1 }],
      ["messages", { conversationId: 1, createdAt: -1, _id: -1 }],
      ["conversation_events", { conversationId: 1, createdAt: -1 }],
      ["tickets", { customerId: 1, updatedAt: -1, _id: -1 }],
      ["tickets", { status: 1, updatedAt: -1, _id: -1 }],
      ["tickets", { customerId: 1, status: 1, nextResponseDueAt: 1 }],
      ["tickets", { customerId: 1, status: 1, resolvedAt: -1 }],
      ["ticket_events", { ticketId: 1, createdAt: 1, _id: 1 }],
      ["ticket_drafts", { customerId: 1, expiresAt: 1 }],
      ["agent_runs", { conversationId: 1, createdAt: -1 }],
    ] as const;
    for (const [collection, index] of indexes) {
      await db.collection(collection).createIndex({ ...index });
      console.log("Index ready:", collection, Object.keys(index).join(", "));
    }
  } finally {
    await db.client.close();
  }
}
main().catch((error) => {
  console.error(
    "Database setup failed:",
    error.codeName || error.name,
    error.message?.replace(/mongodb:\/\/[^\s]+/g, "[redacted]"),
  );
  process.exitCode = 1;
});
