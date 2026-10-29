import { loadEnvConfig } from "@next/env";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Conversation, Message, SessionUser } from "../src/types/domain";
import type { AgentRun } from "../src/types/ai";
import type { Ticket, TicketDraft } from "../src/types/tickets";
loadEnvConfig(process.cwd());

async function main() {
  const { database } = await import("../src/server/lib/mongodb");
  const { getAdminAuth } =
    await import("../src/server/lib/firebase/firebase-admin");
  const { agentRunRepository } =
    await import("../src/server/repositories/agent-runs");
  const { ticketRepository } =
    await import("../src/server/repositories/tickets");
  const { createTicketService } =
    await import("../src/server/services/tickets");
  const { createAgentTurnService } =
    await import("../src/server/services/agent-turns");
  const { createNexoAgent } =
    await import("../src/server/ai/agents/nexo-agent");
  const { createNexoTools } = await import("../src/server/ai/tools");
  const { scriptedModel, textParts, toolCall } =
    await import("./helpers/scripted-model");
  const { Mastra } = await import("@mastra/core/mastra");
  const db = await database();
  const auth = getAdminAuth();
  const prefix = `handoff-ui-${randomUUID()}`;
  const people: SessionUser[] = [
    "employee",
    "analyst-a",
    "analyst-b",
    "foreign",
  ].map((key, index) => ({
    uid: `${prefix}-${key}`,
    name: `Teste ${key}`,
    email: `${prefix}-${key}@example.test`,
    role: index === 1 || index === 2 ? "agent" : "chat",
  }));
  const created: string[] = [];
  const conversationIds = new Set<string>();
  const user = people[0];
  const base = process.env.TEST_BASE_URL || "http://localhost:3000";
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors: string[] = [];
  let modelCalls = 0;
  let resumedPrompt = "";
  const tickets = createTicketService({
    repository: ticketRepository,
    authenticate: async () => user,
    now: () => new Date(),
    available: () => {},
  });
  const pages: import("@playwright/test").Page[] = [];
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
    const [employee, a, b, foreign] = pages;
    const prepared = await tickets.prepareTicketChange({
      operation: "create",
      data: {
        title: "Notebook de teste sem energia",
        description: "Notebook não liga e não há outro equipamento disponível.",
        type: "INC",
        category: "Hardware",
        impact: "person",
        urgency: "blocked",
      },
    });
    const ticket = await tickets.confirmTicketChange({
      draftId: prepared.draftId,
      digest: prepared.digest,
      token: prepared.token,
    });
    let first = true;
    await employee.route("**/api/agent", async (route) => {
      const input = route.request().postDataJSON();
      conversationIds.add(input.conversationId);
      const agent = createNexoAgent(
        scriptedModel(
          first
            ? [
                [
                  toolCall("getTicketDetails", {
                    ticketId: ticket._id,
                    rationale: "Consultar chamado relacionado.",
                  }),
                ],
                [
                  toolCall("requestHumanHandoff", {
                    reason: "requested",
                    summary:
                      "Funcionário pede atendimento humano para notebook sem energia.",
                    rationale: "Respeitar a necessidade de atendimento humano.",
                  }),
                ],
                textParts("FORBIDDEN LATE RESPONSE"),
              ]
            : [
                textParts(
                  "Retomando o atendimento com o contexto do analista.",
                ),
              ],
          (options) => {
            modelCalls++;
            if (!first) resumedPrompt = JSON.stringify(options.prompt);
          },
        ),
        createNexoTools({ tickets, knowledge: async () => [] }),
      );
      new Mastra({ agents: { agent }, logger: false });
      const start = createAgentTurnService({
        repository: agentRunRepository,
        authenticate: async () => user,
        configured: () => {},
        agent: async () => agent,
      });
      const events = [];
      for await (const event of await start(
        input,
        new AbortController().signal,
      ))
        events.push(event);
      first = false;
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: events.map((event) => JSON.stringify(event)).join("\n") + "\n",
      });
    });
    await employee.goto(`${base}/chat`);
    const input = employee.getByRole("textbox", {
      name: "Mensagem",
      exact: true,
    });
    await input.fill("Preciso conversar com uma pessoa sobre meu notebook.");
    await input.press("Enter");
    await expect(
      employee.getByText(/Sua conversa foi encaminhada à fila/),
    ).toHaveCount(1, { timeout: 25000 });
    const id = [...conversationIds][0];
    assert.ok(id);
    assert.equal(modelCalls, 2);
    await Promise.all([
      a.goto(`${base}/agent?status=waiting&conversation=${id}`),
      b.goto(`${base}/agent?status=waiting&conversation=${id}`),
    ]);
    await expect(a.locator('[data-visual="handoff-context"]')).toContainText(
      "Solicitação do funcionário",
    );
    await expect(a.locator('[data-visual="handoff-context"]')).toContainText(
      ticket.title,
    );
    await a.setViewportSize({ width: 390, height: 900 });
    await a
      .getByRole("button", { name: "Opções da conversa", exact: true })
      .click();
    await a
      .getByRole("button", { name: "Mostrar atendimentos", exact: true })
      .click();
    await expect(a.locator('[data-visual="handoff-context"]')).toBeVisible();
    await a
      .getByRole("button", {
        name: "Fechar painel de atendimentos",
        exact: true,
      })
      .click();
    await a.setViewportSize({ width: 1440, height: 900 });
    await Promise.all([
      a
        .getByRole("button", { name: "Assumir atendimento", exact: true })
        .click(),
      b
        .getByRole("button", { name: "Assumir atendimento", exact: true })
        .click(),
    ]);
    await expect
      .poll(
        async () =>
          (
            await db
              .collection<Conversation>("conversations")
              .findOne({ _id: id })
          )?.status,
        { timeout: 20000 },
      )
      .toBe("active");
    const assigned = (await db
      .collection<Conversation>("conversations")
      .findOne({ _id: id }))!;
    const winnerIndex = people.findIndex(
      (person) => person.uid === assigned.agentId,
    );
    const winner = pages[winnerIndex];
    const loser = winnerIndex === 1 ? b : a;
    await winner.reload();
    await loser.reload();
    await expect(
      loser.getByRole("textbox", { name: "Mensagem", exact: true }),
    ).toHaveCount(0);
    const humanText = "Verifiquei a fonte; teste outra tomada antes de ligar.";
    await winner
      .getByRole("textbox", { name: "Mensagem", exact: true })
      .fill(humanText);
    await winner
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await employee.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(employee.getByText(humanText, { exact: true })).toHaveCount(
      1,
      { timeout: 25000 },
    );
    await input.fill("Já testei a outra tomada.");
    await input.press("Enter");
    await winner.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      winner.getByText("Já testei a outra tomada.", { exact: true }),
    ).toHaveCount(1, { timeout: 25000 });
    assert.equal(modelCalls, 2);
    await winner
      .getByRole("button", { name: "Devolver à IA", exact: true })
      .evaluate((element: HTMLButtonElement) => {
        element.click();
        element.click();
      });
    await expect
      .poll(
        async () =>
          (
            await db
              .collection<Conversation>("conversations")
              .findOne({ _id: id })
          )?.aiHandoff,
        { timeout: 20000 },
      )
      .toBe(false);
    await employee.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      employee.getByText(/devolveu o atendimento ao Nexo Assist/),
    ).toHaveCount(1, { timeout: 25000 });
    assert.equal(modelCalls, 2);
    await input.fill("Podemos continuar de onde paramos.");
    await input.press("Enter");
    await expect(
      employee.getByText(
        "Retomando o atendimento com o contexto do analista.",
        { exact: true },
      ),
    ).toHaveCount(1, { timeout: 25000 });
    assert.ok(resumedPrompt.includes(humanText));
    assert.ok(resumedPrompt.includes("Já testei a outra tomada."));
    assert.equal(modelCalls, 3);
    await db
      .collection<Conversation>("conversations")
      .updateOne({ _id: id }, { $set: { aiMessageCount: 30 } });
    await employee
      .getByRole("button", {
        name: "Solicitar atendimento humano",
        exact: true,
      })
      .evaluate((element: HTMLButtonElement) => {
        element.click();
        element.click();
      });
    await expect
      .poll(
        async () =>
          (
            await db
              .collection<Conversation>("conversations")
              .findOne({ _id: id })
          )?.aiHandoff,
        { timeout: 20000 },
      )
      .toBe(true);
    assert.equal(modelCalls, 3);
    assert.equal(
      await db
        .collection("conversation_events")
        .countDocuments({ conversationId: id, operation: "request_human" }),
      2,
    );
    await winner.reload();
    await winner
      .getByRole("button", { name: "Assumir atendimento", exact: true })
      .click();
    await expect(
      winner.getByRole("button", { name: "Devolver à IA", exact: true }),
    ).toBeEnabled({ timeout: 20000 });
    await winner
      .getByRole("button", { name: "Encerrar atendimento", exact: true })
      .click();
    await winner
      .getByRole("dialog")
      .getByRole("button", { name: "Encerrar atendimento", exact: true })
      .click();
    await employee.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(input).toBeDisabled({ timeout: 25000 });
    assert.equal((await tickets.getTicket(ticket._id)).status, "open");
    await foreign.goto(`${base}/chat?conversation=${id}`);
    await expect(
      foreign
        .getByRole("alert")
        .filter({ hasText: "Atendimento não encontrado" }),
    ).toHaveCount(1);
    assert.equal(
      await db
        .collection("conversation_events")
        .countDocuments({
          conversationId: id,
          operation: "return_to_ai",
          outcome: "success",
        }),
      1,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Handoff UI passed: real role authorization, structured summary, mobile console, competing analysts, human exchange without LLM, return with context, idempotent action, close without ticket resolution and foreign employee denial.",
    );
  } catch (error) {
    console.error(
      "Handoff UI diagnostic:",
      await Promise.all(
        pages.map(async (page) => ({
          url: page.url(),
          alerts: await page.getByRole("alert").allTextContents(),
        })),
      ),
    );
    throw error;
  } finally {
    await browser.close();
    const ids = [...conversationIds];
    const rows = await db
      .collection<Ticket>("tickets")
      .find({ customerId: user.uid })
      .toArray();
    await db
      .collection("ticket_events")
      .deleteMany({ ticketId: { $in: rows.map((ticket) => ticket._id) } });
    await db.collection<Ticket>("tickets").deleteMany({ customerId: user.uid });
    await db
      .collection<TicketDraft>("ticket_drafts")
      .deleteMany({ customerId: user.uid });
    await db
      .collection<{ _id: string }>("ticket_customer_locks")
      .deleteOne({ _id: user.uid });
    await db
      .collection<AgentRun>("agent_runs")
      .deleteMany({ customerId: user.uid });
    await db
      .collection<Message>("messages")
      .deleteMany({ conversationId: { $in: ids } });
    await db
      .collection("conversation_events")
      .deleteMany({ conversationId: { $in: ids } });
    await db
      .collection<Conversation>("conversations")
      .deleteMany({ customerId: user.uid });
    for (const uid of created) await auth.deleteUser(uid);
    await db.client.close();
  }
}
main().catch((error) => {
  console.error(
    "Handoff UI failed:",
    error instanceof Error ? error.message : "UnknownError",
  );
  process.exitCode = 1;
});
