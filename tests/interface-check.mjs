import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

const baseURL = process.env.TEST_BASE_URL || "http://localhost:3000";
const cloud = process.argv.includes("--cloud");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const accounts = [];
const contexts = [];
let auth;
let database;
const conversationIds = [];
async function newPage() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(30000);
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  return page;
}
async function enter(page, account, route) {
  await page.goto(baseURL);
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(`**/${route}`);
}
try {
  const page = await newPage();
  for (const path of ["/chat", "/profile", "/agent"]) {
    await page.goto(baseURL + path);
    await page.waitForURL(baseURL + "/");
  }
  assert.equal(await page.locator("#email").inputValue(), "");
  assert.equal(await page.locator("#password").inputValue(), "");
  await page.getByRole("button", { name: "Mostrar senha" }).click();
  assert.equal(await page.locator("#password").getAttribute("type"), "text");
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Informe seu e-mail" })
    .waitFor();
  await page
    .context()
    .addCookies([
      { name: "nexo-session", value: "forged-cookie", url: baseURL },
    ]);
  await page.goto(baseURL + "/agent");
  await page.waitForURL(baseURL + "/");
  await page.context().clearCookies();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Login overflow at ${width}`,
    );
  }
  console.log(
    "Anonymous UI checks passed: protected routes, forged cookie, empty credentials, reset and responsive login.",
  );
  if (cloud) {
    const { getAdminAuth } =
      await import("../src/server/lib/firebase/firebase-admin.ts");
    auth = getAdminAuth();
    for (const role of ["chat", "chat", "agent", "agent", null]) {
      const password = randomBytes(24).toString("base64url");
      const user = await auth.createUser({
        email: `nexo-test-${randomUUID()}@example.test`,
        password,
        displayName: "Teste temporário",
      });
      accounts.push({ ...user, password });
      if (role) await auth.setCustomUserClaims(user.uid, { role });
    }
    const [customer, otherCustomer, agent, otherAgent, unassigned] = accounts;
    const customerPage = await newPage();
    // Real services/persistence with a controlled provider: this auth test must
    // never depend on an OpenAI key or generate paid model traffic.
    const { createAgentTurnService } =
      await import("../src/server/services/agent-turns.ts");
    const { agentRunRepository } =
      await import("../src/server/repositories/agent-runs.ts");
    const { createNexoAgent } =
      await import("../src/server/ai/agents/nexo-agent.ts");
    const { createNexoTools } = await import("../src/server/ai/tools/index.ts");
    const { ticketService } = await import("../src/server/services/tickets.ts");
    const { scriptedModel, textParts } =
      await import("./helpers/scripted-model.ts");
    const { Mastra } = await import("@mastra/core/mastra");
    const controlled = createAgentTurnService({
      repository: agentRunRepository,
      configured: () => {},
      authenticate: async () => ({
        uid: customer.uid,
        name: customer.displayName,
        email: customer.email,
        role: "chat",
      }),
      agent: async () => {
        const agent = createNexoAgent(
          scriptedModel([textParts("Recebi sua mensagem de teste.")]),
          createNexoTools({
            tickets: ticketService,
            knowledge: async () => [],
          }),
        );
        new Mastra({ agents: { agent }, logger: false });
        return agent;
      },
    });
    await customerPage.route("**/api/agent", async (route) => {
      const events = [];
      for await (const event of await controlled(
        route.request().postDataJSON(),
        new AbortController().signal,
      ))
        events.push(event);
      await route.fulfill({
        contentType: "application/x-ndjson",
        body: events.map((event) => JSON.stringify(event)).join("\n") + "\n",
      });
    });
    await enter(customerPage, customer, "chat");
    const cookies = await customerPage.context().cookies();
    const session = cookies.find((cookie) => cookie.name === "nexo-session");
    assert.ok(session?.httpOnly);
    assert.equal(session.sameSite, "Lax");
    assert.deepEqual(
      await customerPage.evaluate(() => Object.keys(localStorage)),
      [],
    );
    await customerPage.goto(baseURL + "/agent");
    await customerPage.waitForURL("**/chat");
    await customerPage
      .getByLabel("Mensagem", { exact: true })
      .fill("Teste de atendimento persistente");
    await customerPage.getByRole("button", { name: "Enviar mensagem" }).click();
    await customerPage.waitForURL(/conversation=/);
    const id = new URL(customerPage.url()).searchParams.get("conversation");
    conversationIds.push(id);
    await customerPage
      .getByRole("button", { name: "Enviar mensagem" })
      .waitFor();
    await customerPage
      .getByText("Recebi sua mensagem de teste.", { exact: true })
      .waitFor();
    await customerPage
      .getByLabel("Mensagem", { exact: true })
      .fill("Preciso de ajuda com o acesso.");
    await customerPage.getByRole("button", { name: "Enviar mensagem" }).click();
    await customerPage
      .getByText("Preciso de ajuda com o acesso.", { exact: true })
      .waitFor();
    await customerPage.reload();
    await customerPage
      .getByText("Preciso de ajuda com o acesso.", { exact: true })
      .waitFor();
    const strangerPage = await newPage();
    await enter(strangerPage, otherCustomer, "chat");
    await strangerPage.goto(`${baseURL}/chat?conversation=${id}`);
    await strangerPage
      .getByRole("alert")
      .filter({ hasText: "Atendimento não encontrado" })
      .waitFor();
    const agentPage = await newPage();
    await enter(agentPage, agent, "agent");
    await agentPage.goto(baseURL + "/chat");
    await agentPage.waitForURL("**/agent");
    await agentPage.goto(`${baseURL}/agent?conversation=${id}`);
    await agentPage
      .getByRole("button", { name: "Assumir atendimento" })
      .click();
    await agentPage
      .getByLabel("Mensagem", { exact: true })
      .fill("Vou verificar seu acesso.");
    await agentPage.getByRole("button", { name: "Enviar mensagem" }).click();
    await agentPage
      .getByText("Vou verificar seu acesso.", { exact: true })
      .waitFor();
    const observer = await newPage();
    await enter(observer, otherAgent, "agent");
    await observer.goto(`${baseURL}/agent?conversation=${id}`);
    await observer
      .getByText("Vou verificar seu acesso.", { exact: true })
      .waitFor();
    assert.equal(
      await observer.getByLabel("Mensagem", { exact: true }).count(),
      0,
    );
    for (const width of [390, 768, 1440]) {
      await agentPage.setViewportSize({ width, height: 900 });
      assert.ok(
        await agentPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Agent overflow at ${width}`,
      );
    }
    await agentPage
      .getByRole("button", { name: "Encerrar atendimento", exact: true })
      .click();
    await agentPage
      .getByRole("dialog")
      .getByRole("button", { name: "Encerrar atendimento", exact: true })
      .click();
    await agentPage
      .getByText("Atendimento encerrado", { exact: true })
      .first()
      .waitFor();
    const denied = await newPage();
    await denied.goto(baseURL);
    await denied.locator("#email").fill(unassigned.email);
    await denied.locator("#password").fill(unassigned.password);
    await denied.getByRole("button", { name: "Entrar", exact: true }).click();
    await denied
      .getByRole("alert")
      .filter({ hasText: "não possui acesso" })
      .waitFor();
    await auth.setCustomUserClaims(agent.uid, { role: "chat" });
    await agentPage.reload();
    await agentPage.waitForURL(baseURL + "/");
    await customerPage
      .getByRole("button", { name: "Sair", exact: true })
      .click();
    await customerPage.waitForURL(baseURL + "/");
    assert.equal(
      (await customerPage.context().cookies()).some(
        (cookie) => cookie.name === "nexo-session",
      ),
      false,
    );
    console.log(
      "Cloud UI checks passed: login, roles, data isolation, persisted conversation, agent observation, session claims and logout.",
    );
  }
  assert.deepEqual(errors, []);
} catch (error) {
  // Firebase Admin errors can contain request headers and generated passwords.
  console.error("Interface checks failed:", error.code || error.name);
  console.error("Operation:", error.message?.split("\n")[0]);
  console.error(
    "Test location:",
    error.stack
      ?.split("\n")
      .filter((line) => line.includes("interface-check.mjs"))
      .join("\n"),
  );
  for (const context of contexts)
    for (const page of context.pages()) {
      console.error(
        "Page:",
        page.url(),
        "Feedback:",
        await page.locator('[role="alert"], [role="status"]').allTextContents(),
      );
    }
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  if (auth && accounts.length) {
    const { database: sharedDatabase } =
      await import("../src/server/lib/mongodb.ts");
    const db = await sharedDatabase();
    database = db.client;
    try {
      for (const id of conversationIds) {
        await db.collection("messages").deleteMany({ conversationId: id });
        await db
          .collection("conversation_events")
          .deleteMany({ conversationId: id });
        await db.collection("agent_runs").deleteMany({ conversationId: id });
        await db.collection("conversations").deleteOne({ _id: id });
      }
      for (const account of accounts)
        await db.collection("users").deleteOne({ _id: account.uid });
    } catch (error) {
      console.error("Test data cleanup failed:", error.code || error.name);
      process.exitCode = 1;
    } finally {
      await database.close();
      for (const account of accounts) {
        try {
          await auth.deleteUser(account.uid);
        } catch (error) {
          console.error(
            "Test account cleanup failed:",
            error.code || error.name,
          );
          process.exitCode = 1;
        }
      }
    }
  }
}
