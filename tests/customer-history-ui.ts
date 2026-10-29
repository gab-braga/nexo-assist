import { loadEnvConfig } from "@next/env";
import { chromium, expect as baseExpect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Conversation, Message, SessionUser } from "../src/types/domain";
import type { AgentRun } from "../src/types/ai";
loadEnvConfig(process.cwd());
const expect = baseExpect.configure({ timeout: 25000 });

async function main() {
  const { database } = await import("../src/server/lib/mongodb");
  const { getAdminAuth } =
    await import("../src/server/lib/firebase/firebase-admin");
  const { agentRunRepository } =
    await import("../src/server/repositories/agent-runs");
  const { createAgentTurnService } =
    await import("../src/server/services/agent-turns");
  const { createNexoAgent } =
    await import("../src/server/ai/agents/nexo-agent");
  const { createNexoTools } = await import("../src/server/ai/tools");
  const { ticketService } = await import("../src/server/services/tickets");
  const { scriptedModel, textParts } = await import("./helpers/scripted-model");
  const { Mastra } = await import("@mastra/core/mastra");
  const db = await database();
  const auth = getAdminAuth();
  const namespace = `history-ui-${randomUUID()}`;
  const people: SessionUser[] = ["owner", "foreign"].map((key) => ({
    uid: `${namespace}-${key}`,
    name: `Histórico ${key}`,
    email: `${namespace}-${key}@example.test`,
    role: "chat",
  }));
  const ids = Array.from({ length: 13 }, () => randomUUID());
  const created: string[] = [];
  let modelCalls = 0;
  const base = process.env.TEST_BASE_URL || "http://localhost:3000";
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const pages: import("@playwright/test").Page[] = [];
  const errors: string[] = [];
  let release: (() => void) | undefined;
  try {
    for (const person of people) {
      await auth.createUser({
        uid: person.uid,
        email: person.email,
        displayName: person.name,
      });
      created.push(person.uid);
      await auth.setCustomUserClaims(person.uid, { role: person.role });
      const token = await auth.createCustomToken(person.uid);
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, returnSecureToken: true }),
        },
      );
      if (!response.ok) throw new Error("Temporary sign-in failed");
      const { idToken } = (await response.json()) as { idToken: string };
      const cookie = await auth.createSessionCookie(idToken, {
        expiresIn: 3600000,
      });
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      await context.addCookies([
        {
          name: "nexo-session",
          value: cookie,
          url: base,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      pages.push(page);
    }
    const [page, other] = pages;
    await other.goto(`${base}/chat`);
    await other
      .getByRole("button", { name: "Meus atendimentos", exact: true })
      .click();
    await expect(other.getByRole("dialog")).toContainText(
      "Você ainda não tem atendimentos.",
    );
    await other.keyboard.press("Escape");

    const now = Date.now();
    const conversations: Conversation[] = ids.map((_id, index) => ({
      _id,
      customerId: people[0].uid,
      customerName: people[0].name,
      subject: `Histórico ${String(index).padStart(2, "0")}`,
      status:
        index % 4 === 2 ? "active" : index % 4 === 3 ? "closed" : "waiting",
      aiEnabled: true,
      aiHandoff: index % 4 !== 0,
      agentId: index % 4 === 2 ? "temporary-analyst" : null,
      agentName: index % 4 === 2 ? "Analista temporário" : null,
      createdAt: new Date(now - 86400000),
      updatedAt: new Date(now - index * 60000),
      version: index === 3 ? 55 : 2,
    }));
    await db
      .collection<Conversation>("conversations")
      .insertMany(conversations);
    const messages: Message[] = conversations.flatMap((conversation, index) =>
      Array.from({ length: index === 3 ? 55 : 2 }, (_, offset) => ({
        _id: randomUUID(),
        conversationId: conversation._id,
        authorId: people[0].uid,
        authorName: people[0].name,
        role: "chat" as const,
        text:
          offset === (index === 3 ? 54 : 1)
            ? `Última mensagem ${index}`
            : `Mensagem anterior ${index}-${offset}`,
        sequence: offset + 1,
        createdAt: conversation.updatedAt,
      })),
    );
    await db.collection<Message>("messages").insertMany(messages);
    const count = () =>
      db
        .collection<Conversation>("conversations")
        .countDocuments({ customerId: people[0].uid });
    let mode: "hold" | "normal" | "failure" = "hold";
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/chat**", async (route) => {
      if (
        route.request().method() !== "POST" ||
        !route.request().headers()["next-action"]
      ) {
        await route.continue();
        return;
      }
      if (mode === "hold") await gate;
      if (mode === "failure") await route.abort("failed");
      else await route.continue();
    });
    let requests = 0;
    await page.route("**/api/agent", async (route) => {
      requests++;
      const input = route.request().postDataJSON();
      assert.equal(input.conversationId, ids[0]);
      assert.equal(input.startConversation, undefined);
      const agent = createNexoAgent(
        scriptedModel([textParts("Continuando a conversa existente.")], () => {
          modelCalls++;
        }),
        createNexoTools({ tickets: ticketService, knowledge: async () => [] }),
      );
      new Mastra({ agents: { agent }, logger: false });
      const start = createAgentTurnService({
        repository: agentRunRepository,
        authenticate: async () => people[0],
        configured: () => {},
        agent: async () => agent,
      });
      const events = [];
      for await (const event of await start(
        input,
        new AbortController().signal,
      ))
        events.push(event);
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: events.map((event) => JSON.stringify(event)).join("\n") + "\n",
      });
    });
    await page.goto(`${base}/chat`);
    const trigger = page.getByRole("button", {
      name: "Meus atendimentos",
      exact: true,
    });
    const dialog = page.getByRole("dialog", { name: "Meus atendimentos" });
    await trigger.click();
    await expect(
      dialog.getByRole("status", { name: "Carregando atendimentos" }),
    ).toBeVisible();
    assert.equal(await count(), 13);
    mode = "normal";
    release?.();
    await expect(
      dialog.getByRole("button", {
        name: /^(Continuar|Consultar) atendimento:/,
      }),
    ).toHaveCount(10);
    await expect(dialog).toContainText("Última mensagem 0");
    for (const text of [
      "Atendimento com IA",
      "Aguardando analista",
      "Em atendimento humano",
      "Encerrado",
    ])
      await expect(dialog).toContainText(text);
    const titles = await dialog
      .locator('button[aria-label$="Histórico 00"]')
      .allTextContents();
    assert.equal(titles.length, 1);
    assert.match(
      (await dialog
        .getByRole("button", { name: /^(Continuar|Consultar) atendimento:/ })
        .first()
        .getAttribute("aria-label")) ?? "",
      /Histórico 00$/,
    );
    await dialog
      .getByRole("button", { name: "Carregar mais atendimentos", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", {
        name: /^(Continuar|Consultar) atendimento:/,
      }),
    ).toHaveCount(13);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const box = await dialog.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    mode = "failure";
    await trigger.click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Não foi possível carregar",
    );
    mode = "normal";
    await dialog.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(
      dialog.getByRole("button", {
        name: /^(Continuar|Consultar) atendimento:/,
      }),
    ).toHaveCount(10);
    await dialog
      .getByRole("button", {
        name: "Consultar atendimento: Histórico 03",
        exact: true,
      })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(ids[3]));
    const composer = page.getByRole("textbox", {
      name: "Mensagem",
      exact: true,
    });
    await expect(composer).toBeDisabled();
    await expect(
      page.getByText("Última mensagem 3", { exact: true }),
    ).toHaveCount(1);
    await page
      .getByRole("link", { name: "Mensagens anteriores", exact: true })
      .click();
    await expect(
      page.getByText("Mensagem anterior 3-0", { exact: true }),
    ).toHaveCount(1);
    for (const index of [1, 2]) {
      await trigger.click();
      await dialog
        .getByRole("button", {
          name: `Continuar atendimento: Histórico 0${index}`,
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(new RegExp(ids[index]));
      assert.equal(new URL(page.url()).searchParams.get("before"), null);
      await expect(composer).toBeEnabled();
      await composer.fill(`Continuar atendimento humano ${index}`);
      await composer.press("Enter");
      await expect(
        page.getByText(`Continuar atendimento humano ${index}`, {
          exact: true,
        }),
      ).toHaveCount(1);
    }
    assert.equal(requests, 0);
    assert.equal(modelCalls, 0);
    await trigger.click();
    await dialog
      .getByRole("button", {
        name: "Continuar atendimento: Histórico 00",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(new RegExp(ids[0]));
    await expect(composer).toBeEnabled();
    await composer.fill("Retomar meu atendimento com IA");
    await composer.press("Enter");
    await expect(
      page.getByText("Continuando a conversa existente.", { exact: true }),
    ).toHaveCount(1);
    await page.reload();
    await expect(
      page.getByText("Continuando a conversa existente.", { exact: true }),
    ).toHaveCount(1);
    assert.equal(requests, 1);
    assert.equal(modelCalls, 1);
    assert.equal(await count(), 13);
    await other.goto(`${base}/chat`);
    await other
      .getByRole("button", { name: "Meus atendimentos", exact: true })
      .click();
    await expect(other.getByRole("dialog")).toContainText(
      "Você ainda não tem atendimentos.",
    );
    await other.keyboard.press("Escape");
    await other.goto(`${base}/chat?conversation=${ids[0]}`);
    await expect(
      other
        .getByRole("alert")
        .filter({ hasText: "Atendimento não encontrado" }),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: "Novo atendimento", exact: true })
      .click();
    await expect(page).not.toHaveURL(/conversation=/);
    await expect(composer).toHaveValue("");
    assert.equal(await count(), 13);
    assert.deepEqual(errors, []);
    console.log(
      "Customer history UI passed: authenticated empty/isolation states, Skeleton, pagination/order/previews/statuses, responsive modal, focus restoration, failure/retry, closed history pagination, human continuation without LLM, AI continuation/reload and no new conversations.",
    );
  } catch (error) {
    release?.();
    console.error(
      "History UI diagnostic:",
      await Promise.all(
        pages.map(async (page) => ({
          url: page.url(),
          alerts: await page.getByRole("alert").allTextContents(),
          text: (await page.locator("body").innerText()).slice(-1200),
        })),
      ),
    );
    throw error;
  } finally {
    release?.();
    await browser.close();
    await db
      .collection<AgentRun>("agent_runs")
      .deleteMany({ customerId: people[0].uid });
    await db
      .collection<Message>("messages")
      .deleteMany({ conversationId: { $in: ids } });
    await db
      .collection("conversation_events")
      .deleteMany({ conversationId: { $in: ids } });
    await db
      .collection<Conversation>("conversations")
      .deleteMany({ _id: { $in: ids }, customerId: people[0].uid });
    for (const uid of created) await auth.deleteUser(uid);
    await db.client.close();
  }
}
main().catch((error) => {
  console.error(
    "Customer history UI failed:",
    error instanceof Error ? error.message : "UnknownError",
  );
  process.exitCode = 1;
});
