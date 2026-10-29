import { loadEnvConfig } from "@next/env";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Conversation, Message } from "../src/types/domain";
loadEnvConfig(process.cwd());

async function main() {
  const { database } = await import("../src/server/lib/mongodb");
  const { getAdminAuth } = await import("../src/server/lib/firebase/firebase-admin");
  const { createConversationRecord } = await import("../src/server/repositories/conversations");
  const db = await database();
  const auth = getAdminAuth();
  const id = randomUUID();
  const uid = `agent-ui-${id}`;
  const base = process.env.TEST_BASE_URL || "http://localhost:3000";
  let accountCreated = false;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    await auth.createUser({ uid, email: `${uid}@example.test`, displayName: "Teste chat" });
    accountCreated = true;
    await auth.setCustomUserClaims(uid, { role: "chat" });
    const token = await auth.createCustomToken(uid);
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true }),
    });
    if (!response.ok) throw new Error("Temporary sign-in failed");
    const { idToken } = await response.json() as { idToken: string };
    const cookie = await auth.createSessionCookie(idToken, { expiresIn: 3600000 });
    await createConversationRecord({ _id: id, customerId: uid, customerName: "Teste chat", subject: "Teste de integração do chat", status: "waiting", agentId: null, agentName: null, createdAt: new Date(), updatedAt: new Date(), version: 0, aiEnabled: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([{ name: "nexo-session", value: cookie, url: base, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.name));
    const requests: string[] = [];
    await page.route("**/api/agent", async route => {
      const input = route.request().postDataJSON() as { requestId: string; conversationId: string; text: string };
      assert.equal(input.conversationId, id);
      requests.push(input.requestId);
      const events = requests.length === 1 ? [
        { type: "started", runId: input.requestId }, { type: "delta", text: "Resposta em " }, { type: "delta", text: "streaming." },
        { type: "completed", message: { _id: randomUUID(), conversationId: id, authorId: "nexo-assist", authorName: "Nexo Assist", role: "assistant", text: "Resposta em streaming.", createdAt: new Date().toISOString() } },
      ] : [{ type: "error", code: "AI_PROVIDER_LIMIT", error: "O assistente está temporariamente indisponível." }];
      await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: events.map(event => JSON.stringify(event)).join("\n") + "\n" });
    });
    await page.goto(`${base}/chat?conversation=${id}`);
    const composer = page.getByRole("textbox", { name: "Mensagem", exact: true });
    const send = page.getByRole("button", { name: "Enviar mensagem", exact: true });
    await composer.fill("Preciso de ajuda com a VPN");
    await send.click();
    await expect(page.getByText("Resposta em streaming.", { exact: true })).toHaveCount(1);
    await expect(composer).toHaveValue("");
    await composer.fill("Nova consulta");
    await send.click();
    await expect(page.getByRole("alert").filter({ hasText: "temporariamente indisponível" })).toHaveCount(1);
    await expect(send).toBeEnabled();
    await send.click();
    await expect.poll(() => requests.length).toBe(3);
    assert.notEqual(requests[1], requests[2]); // terminal failure permits an explicit new attempt
    assert.deepEqual(errors, []);
    console.log("Agent UI passed: existing authenticated chat, NDJSON rendering, single response bubble, preserved input on error and explicit retry. Provider intercepted only in browser test.");
  } finally {
    await browser.close();
    await db.collection<Message>("messages").deleteMany({ conversationId: id });
    await db.collection<Conversation>("conversations").deleteOne({ _id: id, customerId: uid });
    if (accountCreated) await auth.deleteUser(uid);
    await db.client.close();
  }
}
main().catch(error => {
  console.error("Agent UI failed:", error instanceof Error ? error.message : "UnknownError");
  process.exitCode = 1;
});
