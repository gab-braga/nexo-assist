import { loadEnvConfig } from "@next/env";
import { chromium, expect as baseExpect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Conversation, Message } from "../src/types/domain";
import type { AgentRun } from "../src/types/ai";
import type { AgentTurnInput } from "../src/server/ai/schemas";
import type { Ticket, TicketData, TicketDraft } from "../src/types/tickets";
loadEnvConfig(process.cwd());
// These checks include real Firestore transactions and Server Component refreshes.
const expect = baseExpect.configure({ timeout: 25000 });

async function main() {
  const { database } = await import("../src/server/lib/mongodb");
  const { getAdminAuth } =
    await import("../src/server/lib/firebase/firebase-admin");
  const { agentRunRepository } =
    await import("../src/server/repositories/agent-runs");
  const { createAgentTurnService, agentError } =
    await import("../src/server/services/agent-turns");
  const { createNexoAgent } =
    await import("../src/server/ai/agents/nexo-agent");
  const { createNexoTools } = await import("../src/server/ai/tools");
  const { createTicketService } =
    await import("../src/server/services/tickets");
  const { ticketRepository } =
    await import("../src/server/repositories/tickets");
  const { scriptedModel, textParts, toolCall } =
    await import("./helpers/scripted-model");
  const { conversationTitle } = await import("../src/lib/conversation-title");
  const { Mastra } = await import("@mastra/core/mastra");
  const db = await database();
  const auth = getAdminAuth();
  const uid = `agent-ui-${randomUUID()}`;
  const base = process.env.TEST_BASE_URL || "http://localhost:3000";
  const user = {
    uid,
    name: "Teste chat",
    email: `${uid}@example.test`,
    role: "chat" as const,
  };
  let accountCreated = false;
  let mode:
    | "normal"
    | "creation-failure"
    | "lose-response"
    | "model-failure"
    | "collect"
    | "draft" = "normal";
  let modelCalls = 0;
  const requests: AgentTurnInput[] = [];
  const conversationIds = new Set<string>();
  const ticketService = createTicketService({
    repository: ticketRepository,
    authenticate: async () => user,
    available: () => {},
    now: () => new Date(),
  });
  let proposedData: TicketData = {
    title: "Notebook sem energia",
    description: "Notebook não liga e estou sem alternativa para trabalhar.",
    type: "INC",
    category: "Hardware",
    impact: "person",
    urgency: "blocked",
  };
  const tools = createNexoTools({
    tickets: ticketService,
    knowledge: async () => [],
  });
  const start = createAgentTurnService({
    repository: agentRunRepository,
    configured: () => {},
    authenticate: async () => user,
    agent: async () => {
      modelCalls++;
      const agent = createNexoAgent(
        scriptedModel(
          mode === "model-failure"
            ? [
                [
                  {
                    type: "error",
                    error: new Error("Injected provider failure"),
                  },
                ],
              ]
            : mode === "collect"
              ? [
                  [
                    toolCall("updateConversationFlow", {
                      state: {
                        intent: "create",
                        stage: "collecting",
                        data: {
                          title: proposedData.title,
                          type: proposedData.type,
                          category: proposedData.category,
                          impact: "person",
                        },
                        question: "Consegue trabalhar em outro equipamento?",
                        choices: [
                          {
                            label: "Sem alternativa",
                            message: "Não tenho alternativa para trabalhar.",
                          },
                          {
                            label: "Tenho alternativa",
                            message: "Consigo trabalhar com outro equipamento.",
                          },
                        ],
                      },
                      rationale: "Coletar urgência antes de propor prioridade.",
                    }),
                  ],
                  textParts("Consegue trabalhar em outro equipamento?"),
                ]
              : mode === "draft"
                ? [
                    [
                      toolCall("prepareTicketDraft", {
                        change: { operation: "create", data: proposedData },
                        rationale:
                          "Dados completos para revisão do funcionário.",
                      }),
                    ],
                    textParts("Revise a proposta."),
                  ]
                : [textParts(`Resposta ${modelCalls} em streaming.`)],
        ),
        tools,
      );
      new Mastra({ agents: { agent }, logger: false });
      return agent;
    },
  });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let diagnostic: (() => Promise<unknown>) | undefined;
  try {
    await auth.createUser({ uid, email: user.email, displayName: user.name });
    accountCreated = true;
    await auth.setCustomUserClaims(uid, { role: "chat" });
    const token = await auth.createCustomToken(uid);
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
    diagnostic = async () => ({
      url: page.url(),
      alerts: await page.getByRole("alert").allTextContents(),
      draft: await page
        .getByRole("textbox", { name: "Mensagem", exact: true })
        .inputValue({ timeout: 1000 })
        .catch(() => null),
      visibleText: (await page.locator("body").innerText()).slice(0, 1600),
      requests: requests.map((input) => ({
        id: input.requestId,
        conversationId: input.conversationId,
        start: input.startConversation,
      })),
      modelCalls,
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // Only the provider/transport is intercepted in this test. Actual application
    // services, transactions, messages and subsequent Server Component reads run
    // against Firestore. No paid OpenAI request is made.
    await page.route("**/api/agent", async (route) => {
      const input = route.request().postDataJSON() as AgentTurnInput;
      requests.push(input);
      conversationIds.add(input.conversationId);
      if (mode === "creation-failure") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            code: "AI_UNAVAILABLE",
            error: "Falha temporária antes da criação.",
          }),
        });
        return;
      }
      try {
        const events = [];
        for await (const event of await start(
          input,
          new AbortController().signal,
        ))
          events.push(event);
        if (mode === "lose-response") {
          mode = "normal";
          await route.abort("failed"); // commit succeeded, but the client saw nothing
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/x-ndjson",
          body: events.map((event) => JSON.stringify(event)).join("\n") + "\n",
        });
      } catch (error) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify(agentError(error)),
        });
      }
    });

    await page.goto(`${base}/chat`);
    const composer = page.getByRole("textbox", {
      name: "Mensagem",
      exact: true,
    });
    const send = page.getByRole("button", {
      name: "Enviar mensagem",
      exact: true,
    });
    const newConversation = page.getByRole("button", {
      name: "Novo atendimento",
      exact: true,
    });
    const count = () =>
      db
        .collection<Conversation>("conversations")
        .countDocuments({ customerId: uid });
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(composer).toBeEnabled();
      await expect(page.locator("#subject")).toHaveCount(0);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      const field = await composer.boundingBox();
      const main = await page
        .locator('[data-visual="customer-chat"]')
        .boundingBox();
      assert.ok(field && main);
      assert.ok(
        Math.abs(field.y + field.height / 2 - (main.y + main.height / 2)) < 130,
        "new composer should be near the page center",
      );
    }
    assert.equal(await count(), 0);
    await composer.fill("  ");
    await composer.press("Enter");
    assert.equal(requests.length, 0);
    assert.equal(await count(), 0);
    await composer.fill("Meu notebook não conecta na VPN");
    await composer.press("Shift+Enter");
    await composer.pressSequentially("Erro 809 no Windows 11");
    const firstText = await composer.inputValue();
    assert.ok(firstText.includes("\n"));
    // Simultaneous form submissions must share one request, not two generated IDs.
    await composer.evaluate((element: HTMLTextAreaElement) => {
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      element.form!.requestSubmit();
    });
    await expect(page).toHaveURL(/conversation=/);
    await expect(
      page.getByText("Resposta 1 em streaming.", { exact: true }),
    ).toHaveCount(1);
    await expect(composer).toHaveValue("");
    assert.equal(requests.length, 1);
    assert.equal(modelCalls, 1);
    const firstId = new URL(page.url()).searchParams.get("conversation")!;
    const first = await db
      .collection<Conversation>("conversations")
      .findOne({ _id: firstId });
    assert.equal(first?.subject, conversationTitle(firstText));
    assert.equal(first?.customerId, uid);
    assert.equal(
      await db
        .collection<Message>("messages")
        .countDocuments({ conversationId: firstId }),
      2,
    );
    assert.equal(await count(), 1);
    await page.reload();
    await expect(
      page.getByText("Resposta 1 em streaming.", { exact: true }),
    ).toHaveCount(1);
    assert.equal(requests.length, 1); // reload does not submit the first message
    await composer.fill("Tenho mais uma dúvida");
    await composer.press("Enter");
    await expect(
      page.getByText("Resposta 2 em streaming.", { exact: true }),
    ).toHaveCount(1);
    assert.equal(requests[1].startConversation, undefined);
    assert.equal(requests[1].conversationId, firstId);
    assert.equal(
      (
        await db
          .collection<Conversation>("conversations")
          .findOne({ _id: firstId })
      )?.subject,
      first?.subject,
    );

    const abandoned = await agentRunRepository.begin(
      user,
      {
        requestId: randomUUID(),
        conversationId: firstId,
        text: "Mensagem interrompida antes da resposta.",
      },
      "test",
    );
    await db
      .collection<AgentRun>("agent_runs")
      .updateOne({ _id: abandoned._id }, { $set: { expiresAt: new Date(0) } });
    await page.reload();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "nenhuma operação será repetida automaticamente" }),
    ).toHaveCount(1);
    await expect(
      page.getByText("Mensagem interrompida antes da resposta.", {
        exact: true,
      }),
    ).toHaveCount(1);
    assert.equal(requests.length, 2);
    assert.equal(modelCalls, 2);
    assert.equal(
      (
        await db
          .collection<AgentRun>("agent_runs")
          .findOne({ _id: abandoned._id })
      )?.state,
      "interrupted",
    );

    await newConversation.click();
    await expect(page).not.toHaveURL(/conversation=/);
    await expect(composer).toHaveValue("");
    assert.equal(await count(), 1);
    mode = "creation-failure";
    await composer.fill("Preciso de acesso ao sistema");
    await send.click();
    await expect(
      page.getByRole("alert").filter({ hasText: "antes da criação" }),
    ).toHaveCount(1);
    await expect(composer).toHaveValue("Preciso de acesso ao sistema");
    assert.equal(await count(), 1);
    mode = "normal";
    await send.click();
    await expect(
      page.getByText("Resposta 3 em streaming.", { exact: true }),
    ).toHaveCount(1);
    assert.equal(await count(), 2);

    await newConversation.click();
    await expect(composer).toHaveValue("");
    await expect(page).not.toHaveURL(/conversation=/);
    mode = "lose-response";
    await composer.fill("Meu e-mail não funciona");
    await send.click();
    await expect(
      page.getByRole("alert").filter({ hasText: "texto foi preservado" }),
    ).toHaveCount(1);
    await expect(composer).toHaveValue("Meu e-mail não funciona");
    const uncertain = requests.at(-1)!;
    assert.equal(await count(), 3);
    assert.equal(modelCalls, 4);
    await send.click();
    await expect(
      page.getByText("Resposta 4 em streaming.", { exact: true }),
    ).toHaveCount(1);
    assert.equal(requests.at(-1)?.requestId, uncertain.requestId);
    assert.equal(requests.at(-1)?.conversationId, uncertain.conversationId);
    assert.equal(modelCalls, 4);
    assert.equal(await count(), 3);
    assert.equal(
      await db
        .collection<Message>("messages")
        .countDocuments({ conversationId: uncertain.conversationId }),
      2,
    );

    await newConversation.click();
    await expect(composer).toHaveValue("");
    await expect(page).not.toHaveURL(/conversation=/);
    mode = "model-failure";
    await composer.fill("Meu teclado não funciona");
    await send.click();
    await expect(page).toHaveURL(/conversation=/);
    await expect(
      page.getByRole("alert").filter({ hasText: "não conseguiu" }),
    ).toHaveCount(1);
    await expect(composer).toHaveValue("Meu teclado não funciona");
    const failedId = requests.at(-1)!.conversationId;
    assert.equal(
      await db
        .collection<Message>("messages")
        .countDocuments({ conversationId: failedId }),
      1,
    );
    // The previous poll interval must not remount and erase the failed first text.
    await page.waitForTimeout(10500);
    await expect(composer).toHaveValue("Meu teclado não funciona");
    await newConversation.click();
    await expect(composer).toHaveValue("");
    await composer.fill("Rascunho que não será enviado");
    await newConversation.click();
    await expect(composer).toHaveValue("");
    assert.equal(await count(), 4);
    mode = "collect";
    await composer.fill("Meu notebook não liga. Afeta apenas a mim.");
    await send.click();
    await expect(
      page.getByRole("button", { name: "Sem alternativa", exact: true }),
    ).toBeEnabled({ timeout: 20000 });
    mode = "draft";
    await page
      .getByRole("button", { name: "Sem alternativa", exact: true })
      .click();
    const draftCard = page.locator('[data-visual="draft-card"]');
    const confirm = page.getByRole("button", {
      name: "Confirmar operação",
      exact: true,
    });
    await expect(confirm).toBeEnabled({ timeout: 20000 });
    await expect(draftCard).toContainText("Prioridade: Alta");
    await expect(draftCard).toContainText("4 horas úteis");
    assert.equal(
      await db
        .collection<Ticket>("tickets")
        .countDocuments({ customerId: uid }),
      0,
    );
    await page.reload();
    await expect(confirm).toBeEnabled();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await confirm.evaluate((element: HTMLButtonElement) => {
      element.click();
      element.click();
    });
    await expect(draftCard).toHaveCount(0, { timeout: 20000 });
    await expect(page.getByText(/Abertura confirmada:/)).toHaveCount(1, {
      timeout: 20000,
    });
    const savedTickets = await db
      .collection<Ticket>("tickets")
      .find({ customerId: uid })
      .toArray();
    assert.equal(savedTickets.length, 1);
    assert.equal(
      await db
        .collection<Message>("messages")
        .countDocuments({ "ticket._id": savedTickets[0]._id }),
      1,
    );
    const callsAfterConfirmation = modelCalls;
    await page.reload();
    await expect(page.getByText(/Abertura confirmada:/)).toHaveCount(1);
    assert.equal(modelCalls, callsAfterConfirmation);

    await newConversation.click();
    await expect(composer).toHaveValue("");
    proposedData = {
      title: "Solicitação de monitores externos",
      description: "Preciso de monitor externo para meu trabalho diário.",
      type: "REQ",
      category: "Hardware",
      impact: "person",
      urgency: "normal",
    };
    await composer.fill("Preciso de um monitor sem urgência.");
    await send.click();
    await expect(confirm).toBeEnabled({ timeout: 20000 });
    const cancelledId = requests.at(-1)!.conversationId;
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(draftCard).toHaveCount(0, { timeout: 20000 });
    assert.equal(
      (
        await db
          .collection<Conversation>("conversations")
          .findOne({ _id: cancelledId })
      )?.pendingDraftId,
      null,
    );
    assert.equal(
      await db
        .collection<Ticket>("tickets")
        .countDocuments({ customerId: uid }),
      1,
    );
    await page.reload();
    await expect(draftCard).toHaveCount(0);
    assert.deepEqual(errors, []);
    console.log(
      "Chat UI passed: first-send/reload/failure regressions, persistent quick choices, responsive draft, server-confirmed operation, double-click protection, persisted receipt, reload without model invocation and cancellation.",
    );
  } catch (error) {
    if (diagnostic) console.error("Chat test diagnostic:", await diagnostic());
    throw error;
  } finally {
    await browser.close();
    const tickets = await db
      .collection<Ticket>("tickets")
      .find({ customerId: uid })
      .toArray();
    await db
      .collection("ticket_events")
      .deleteMany({ ticketId: { $in: tickets.map((ticket) => ticket._id) } });
    await db.collection<Ticket>("tickets").deleteMany({ customerId: uid });
    await db
      .collection<TicketDraft>("ticket_drafts")
      .deleteMany({ customerId: uid });
    await db
      .collection<{ _id: string }>("ticket_customer_locks")
      .deleteOne({ _id: uid });
    const ids = [...conversationIds];
    await db.collection<AgentRun>("agent_runs").deleteMany({ customerId: uid });
    await db
      .collection<Message>("messages")
      .deleteMany({ conversationId: { $in: ids } });
    await db
      .collection("conversation_events")
      .deleteMany({ conversationId: { $in: ids } });
    await db
      .collection<Conversation>("conversations")
      .deleteMany({ customerId: uid });
    if (accountCreated) await auth.deleteUser(uid);
    await db.client.close();
  }
}
main().catch((error) => {
  console.error(
    "Agent UI failed:",
    error instanceof Error ? error.message : "UnknownError",
  );
  process.exitCode = 1;
});
