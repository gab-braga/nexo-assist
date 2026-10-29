import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Conversation, Message } from "../src/types/domain";
import type { AgentRun } from "../src/types/ai";
import type { KnowledgeArticle } from "../src/types/tickets";
loadEnvConfig(process.cwd());

// Explicit opt-in command: uses a real API key and may incur a small model cost.
async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY required");
  const { getAdminAuth } = await import("../src/server/lib/firebase/firebase-admin");
  const { database } = await import("../src/server/lib/mongodb");
  const { createConversationRecord } = await import("../src/server/repositories/conversations");
  const { consumeAgentStream } = await import("../src/lib/agent-stream");
  const auth = getAdminAuth();
  const db = await database();
  const id = randomUUID();
  const uid = `agent-live-${id}`;
  const articleId = `agent-live-${id}`;
  const base = process.env.TEST_BASE_URL || "http://localhost:3000";
  let accountCreated = false;
  let stage = "create-account";
  try {
    await auth.createUser({ uid, email: `agent-live-${id}@example.test`, displayName: "Teste temporário IA" });
    accountCreated = true;
    await auth.setCustomUserClaims(uid, { role: "chat" });
    stage = "firebase-session";
    const customToken = await auth.createCustomToken(uid);
    const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    });
    if (!signIn.ok) throw new Error("Temporary Firebase sign-in failed");
    const credentials = await signIn.json() as { idToken: string };
    const cookie = await auth.createSessionCookie(credentials.idToken, { expiresIn: 3600000 });
    stage = "fixtures";
    await createConversationRecord({ _id: id, customerId: uid, customerName: "Teste temporário IA", subject: "Smoke test VPN",
      status: "waiting", agentId: null, agentName: null, version: 0, createdAt: new Date(), updatedAt: new Date(), aiEnabled: true });
    await db.collection<KnowledgeArticle>("knowledge_articles").insertOne({ _id: articleId, title: "VPN erro 809 Windows",
      content: "No Windows 10, reinstale o cliente pelo portal e reinicie. No Windows 11, abra chamado; não aplique a reinstalação como solução garantida.",
      keywords: ["VPN", "809", "Windows"], applicability: ["Reinstalação somente Windows 10", "Windows 11 exige chamado"], category: "Rede e VPN", version: 1 });
    stage = "endpoint";
    const response = await fetch(`${base}/api/agent`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base, Cookie: `nexo-session=${cookie}` },
      body: JSON.stringify({ requestId: randomUUID(), conversationId: id, text: "Tenho Windows 11 e erro VPN 809. Consulte a central de ajuda e explique o que se aplica ao meu sistema. Não abra chamado." }), signal: AbortSignal.timeout(70000) });
    const events: string[] = [];
    await consumeAgentStream(response, event => events.push(event.type));
    assert.ok(events.includes("completed"));
    const run = await db.collection<AgentRun>("agent_runs").findOne({ conversationId: id });
    assert.equal(run?.state, "completed");
    assert.ok(run?.audit.some(event => event.tool === "searchKnowledgeBase" && event.outcome === "success"));
    assert.ok(run?.response?.includes("11"));
    assert.equal(await db.collection("tickets").countDocuments({ customerId: uid }), 0);
    const anonymous = await fetch(`${base}/api/agent`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ requestId: randomUUID(), conversationId: id, text: "Ajuda" }) });
    assert.equal(anonymous.status, 401);
    console.log("Live AI smoke passed: Firebase session, authenticated endpoint, OpenAI/Mastra streaming, real knowledge tool, no ticket write and anonymous rejection. Usage:", run?.usage);
  } catch (error) {
    console.error("Live smoke stage:", stage);
    const failed = await db.collection<AgentRun>("agent_runs").findOne({ conversationId: id });
    if (failed) console.error("Run diagnostic:", { state: failed.state, code: failed.errorCode, tools: failed.audit.map(event => ({ tool: event.tool, outcome: event.outcome, code: event.code })) });
    throw error;
  } finally {
    await db.collection<AgentRun>("agent_runs").deleteMany({ conversationId: id, customerId: uid });
    await db.collection<Message>("messages").deleteMany({ conversationId: id });
    await db.collection("conversation_events").deleteMany({ conversationId: id });
    await db.collection<Conversation>("conversations").deleteOne({ _id: id, customerId: uid });
    await db.collection<KnowledgeArticle>("knowledge_articles").deleteOne({ _id: articleId });
    // Only this run's own account and possible drafts are removed.
    await db.collection("ticket_drafts").deleteMany({ customerId: uid });
    if (accountCreated) await auth.deleteUser(uid);
    await db.client.close();
  }
}
main().catch(error => {
  if (error instanceof assert.AssertionError) console.error(error.message);
  // The transport consumer emits only sanitized product messages, not provider bodies.
  if (error instanceof Error && error.message.startsWith("O assistente")) console.error(error.message);
  console.error("Live AI smoke failed:", error instanceof Error ? error.name : "UnknownError");
  process.exitCode = 1;
});
