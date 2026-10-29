import { loadEnvConfig } from "@next/env";
import { chromium, expect as baseExpect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AgentTurnInput } from "../src/server/ai/schemas";
import type { AgentRun, AgentStreamEvent } from "../src/types/ai";
import type { Conversation, Message, SessionUser } from "../src/types/domain";
import type { Ticket } from "../src/types/tickets";
loadEnvConfig(process.cwd());
const expect = baseExpect.configure({ timeout: 30000 });

async function main() {
  const { database } = await import("../src/server/lib/mongodb");
  const { getAdminAuth } =
    await import("../src/server/lib/firebase/firebase-admin");
  const { agentRunRepository: repository } =
    await import("../src/server/repositories/agent-runs");
  const { createAgentTurnService } =
    await import("../src/server/services/agent-turns");
  const { createNexoAgent } =
    await import("../src/server/ai/agents/nexo-agent");
  const { createNexoTools } = await import("../src/server/ai/tools");
  const { createTicketService } =
    await import("../src/server/services/tickets");
  const { ticketRepository } =
    await import("../src/server/repositories/tickets");
  const { readTransparency } =
    await import("../src/server/repositories/agent-transparency");
  const { scriptedModel, textParts, toolCall } =
    await import("./helpers/scripted-model");
  const { Mastra } = await import("@mastra/core/mastra");
  const { AppError } = await import("../src/server/lib/errors");
  const db = await database();
  const auth = getAdminAuth();
  const base = process.env.TEST_BASE_URL || "http://localhost:3100";
  const namespace = `transparency-${randomUUID()}`;
  const people: SessionUser[] = ["employee", "analyst", "foreign"].map(
    (name, i) => ({
      uid: `${namespace}-${i}`,
      name,
      email: `${namespace}-${i}@example.test`,
      role: i === 1 ? "agent" : "chat",
    }),
  );
  const user = people[0];
  const conversationId = randomUUID();
  const ids: string[] = [conversationId];
  const accounts: string[] = [];
  const browser = await chromium.launch({ channel: "chrome" });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let mode: "knowledge" | "draft" | "duplicates" | "failure" | "handoff" =
    "knowledge";
  const tickets = createTicketService({
    repository: ticketRepository,
    authenticate: async () => user,
    available: () => {},
    now: () => new Date(),
  });
  const data = {
    title: `Notebook ${namespace}`,
    description: "Notebook não liga e não há alternativa de trabalho.",
    type: "INC" as const,
    category: "Hardware" as const,
    impact: "person" as const,
    urgency: "blocked" as const,
  };
  const tools = createNexoTools({
    tickets,
    knowledge: async () => {
      if (mode === "failure")
        throw new AppError("TEMPORARILY_UNAVAILABLE", "Temporary failure");
      await gate;
      return [];
    },
  });
  let calls = 0;
  const start = createAgentTurnService({
    repository,
    configured: () => {},
    authenticate: async () => user,
    agent: async () => {
      calls++;
      const steps =
        mode === "knowledge" || mode === "failure"
          ? [
              [
                toolCall("searchKnowledgeBase", {
                  search: "VPN",
                  rationale: "senha=PRIVATE_RATIONALE",
                }),
              ],
              textParts("Informe o sistema operacional para continuar."),
            ]
          : mode === "draft"
            ? [
                [
                  toolCall("evaluateTicketPriority", {
                    impact: "person",
                    urgency: "blocked",
                    rationale: "Classificar os dados propostos.",
                  }),
                ],
                [
                  toolCall("prepareTicketDraft", {
                    change: { operation: "create", data },
                    rationale: "Dados para revisão explícita.",
                  }),
                ],
                textParts("Revise a proposta antes de confirmar."),
              ]
            : mode === "duplicates"
              ? [
                  [
                    toolCall("findDuplicateTickets", {
                      data,
                      rationale: "Verificar candidatos existentes.",
                    }),
                  ],
                  textParts(
                    "Consulte o chamado existente antes de abrir outro.",
                  ),
                ]
              : [
                  [
                    toolCall("requestHumanHandoff", {
                      reason: "uncertain",
                      summary:
                        "Faltam informações para orientar com segurança.",
                      rationale: "Encaminhar para análise humana.",
                    }),
                  ],
                  textParts("Não publicar texto posterior à transferência."),
                ];
      const agent = createNexoAgent(scriptedModel(steps), tools);
      new Mastra({ agents: { agent }, logger: false });
      return agent;
    },
  });
  const streams = new Map<
    string,
    { iterator: AsyncGenerator<AgentStreamEvent>; controller: AbortController }
  >();
  let diagnosticPage: import("@playwright/test").Page | undefined;
  const emitted: string[] = [];
  try {
    const pages = [];
    for (const person of people) {
      await auth.createUser({
        uid: person.uid,
        email: person.email,
        displayName: person.name,
      });
      accounts.push(person.uid);
      await auth.setCustomUserClaims(person.uid, { role: person.role });
      const token = await auth.createCustomToken(person.uid);
      const signed = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, returnSecureToken: true }),
        },
      );
      assert.ok(signed.ok);
      const { idToken } = (await signed.json()) as { idToken: string };
      const cookie = await auth.createSessionCookie(idToken, {
        expiresIn: 3600000,
      });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
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
      pages.push(await context.newPage());
    }
    const [employee, analyst, foreign] = pages;
    diagnosticPage = employee;
    // Test-only transport: real service, tools and DB, with incremental browser fetch pulls.
    // No production endpoint, authentication bypass or paid model call is introduced.
    await employee.exposeFunction(
      "testAgentStart",
      async (input: AgentTurnInput) => {
        const controller = new AbortController();
        const iterator = await start(input, controller.signal);
        streams.set(input.requestId, { iterator, controller });
        return input.requestId;
      },
    );
    await employee.exposeFunction("testAgentNext", async (id: string) => {
      const next = await streams.get(id)!.iterator.next();
      if (!next.done)
        emitted.push(
          next.value.type === "action"
            ? `action:${next.value.action.state}`
            : next.value.type,
        );
      return next.done ? null : next.value;
    });
    await employee.exposeFunction("testAgentCancel", async (id: string) => {
      const stream = streams.get(id);
      stream?.controller.abort();
      await stream?.iterator.return(undefined);
    });
    await employee.addInitScript(() => {
      const original = window.fetch.bind(window);
      const bridge = window as unknown as {
        testAgentStart(input: unknown): Promise<string>;
        testAgentNext(id: string): Promise<unknown>;
        testAgentCancel(id: string): Promise<void>;
      };
      window.fetch = async (input, init) => {
        if (!String(input).endsWith("/api/agent")) return original(input, init);
        const id = await bridge.testAgentStart(JSON.parse(String(init?.body)));
        init?.signal?.addEventListener(
          "abort",
          () => {
            void bridge.testAgentCancel(id);
          },
          { once: true },
        );
        const encoder = new TextEncoder();
        return new Response(
          new ReadableStream({
            async pull(controller) {
              const event = await bridge.testAgentNext(id);
              if (event === null) controller.close();
              else
                controller.enqueue(
                  encoder.encode(JSON.stringify(event) + "\n"),
                );
            },
            async cancel() {
              await bridge.testAgentCancel(id);
            },
          }),
          { headers: { "Content-Type": "application/x-ndjson" } },
        );
      };
    });
    await employee.goto(`${base}/chat?conversation=${conversationId}`);
    // A new conversation needs the application's new-chat URL; the stream creates its UUID.
    await employee.goto(`${base}/chat`);
    const send = async (text: string) => {
      await employee.locator("textarea").fill(text);
      await employee.locator("textarea").press("Enter");
    };
    await send("VPN não conecta");
    await expect(
      employee.locator('[data-action-state="running"]'),
    ).toBeVisible();
    const running = await db
      .collection<AgentRun>("agent_runs")
      .findOne({ customerId: user.uid });
    assert.ok(running);
    ids.push(running.conversationId);
    const cid = running.conversationId;
    assert.equal(running.audit[0].state, "running");
    assert.equal(running.response, null);
    release();
    await expect(
      employee.getByText("Informe o sistema operacional para continuar.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(employee.locator('[data-action-state="running"]')).toHaveCount(
      0,
    );
    const firstActions = await employee
      .locator("[data-action-id]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-action-id")),
      );
    assert.ok(firstActions.length);
    assert.ok(
      await employee
        .locator('[data-visual="agent-actions"]')
        .first()
        .evaluate(
          (element) =>
            !!(
              element.compareDocumentPosition(
                [...document.querySelectorAll("p")].find(
                  (node) =>
                    node.textContent ===
                    "Informe o sistema operacional para continuar.",
                )!,
              ) & Node.DOCUMENT_POSITION_FOLLOWING
            ),
        ),
    );
    await employee.reload();
    await expect(employee.locator("[data-action-id]").first()).toHaveAttribute(
      "data-action-id",
      firstActions[0]!,
    );
    const saved = await db
      .collection<AgentRun>("agent_runs")
      .findOne({ _id: running._id });
    assert.equal(saved?.audit[0].state, "succeeded");
    assert.ok(saved?.audit[0].durationMs);
    assert.ok(!JSON.stringify(saved?.audit).includes("PRIVATE_RATIONALE"));
    const before = calls;
    for await (const event of await start(
      { requestId: running._id, conversationId: cid, text: "VPN não conecta" },
      new AbortController().signal,
    ))
      assert.ok(["started", "completed"].includes(event.type));
    assert.equal(calls, before);
    mode = "draft";
    await send(
      "Meu notebook não liga e apenas eu estou impedido de trabalhar.",
    );
    await expect(
      employee.getByRole("button", { name: "Confirmar operação", exact: true }),
    ).toBeVisible();
    const draft = (await tickets.getConversationInteraction(cid)).draft!;
    assert.ok(draft);
    assert.equal(
      await db
        .collection<Ticket>("tickets")
        .countDocuments({ customerId: user.uid }),
      0,
    );
    await employee
      .getByRole("button", { name: "Confirmar operação", exact: true })
      .click();
    await expect(
      employee
        .locator('[data-visual="agent-actions"]')
        .filter({ hasText: "Chamado criado" })
        .first(),
    ).toBeVisible();
    await employee.reload();
    const convo = await db
      .collection<Conversation>("conversations")
      .findOne({ _id: cid });
    assert.ok(convo);
    const rows = await db
      .collection<Message>("messages")
      .find({ conversationId: cid })
      .toArray();
    const enriched = await readTransparency(convo, rows, false);
    const committed = enriched
      .flatMap((message) => message.actions ?? [])
      .filter((action) => action.type === "TICKET_CREATED");
    assert.equal(committed.length, 1);
    assert.equal(committed[0].source, "service");
    assert.ok(enriched.every((message) => message.observability === undefined));
    const priority = enriched
      .flatMap((message) => message.actions ?? [])
      .find((action) => action.type === "PRIORITY_EVALUATED")!;
    assert.match(priority.summary, /impedimento/);
    assert.equal(priority.source, "rule");
    mode = "duplicates";
    await send("Verifique se já existe chamado igual.");
    await expect(
      employee.getByText("Consulte o chamado existente antes de abrir outro.", {
        exact: true,
      }),
    ).toBeVisible();
    mode = "failure";
    await send("Consulte a central novamente.");
    await expect(
      employee.locator('[data-action-state="unknown"]').first(),
    ).toBeVisible();
    await expect(employee.locator("textarea")).toHaveValue("");
    mode = "handoff";
    await send("Preciso de uma análise mais segura.");
    await expect
      .poll(
        async () =>
          (
            await db
              .collection<Conversation>("conversations")
              .findOne({ _id: cid })
          )?.aiHandoff,
      )
      .toBe(true);
    await employee.reload();
    await analyst.goto(`${base}/agent?status=waiting&conversation=${cid}`);
    await expect(
      analyst.locator('[data-visual="agent-actions"]').first(),
    ).toBeVisible();
    await analyst
      .locator('[data-visual="agent-actions"] > details')
      .first()
      .locator("summary")
      .first()
      .click();
    await expect(
      analyst.getByText("Diagnóstico da execução", { exact: true }).first(),
    ).toBeVisible();
    const latestRows = await db
      .collection<Message>("messages")
      .find({ conversationId: cid })
      .toArray();
    const latest = await readTransparency(convo, latestRows, true);
    const actions = latest.flatMap((message) => message.actions ?? []);
    assert.ok(
      actions.some(
        (action) =>
          action.type === "DUPLICATE_CHECK" && action.evidence.length === 1,
      ),
    );
    assert.ok(
      actions.some(
        (action) =>
          action.type === "HUMAN_HANDOFF" &&
          action.summary.includes("interpretação"),
      ),
    );
    assert.ok(
      actions.every((action) =>
        latestRows.some((message) => message._id === action.messageId),
      ),
    );
    assert.equal(
      new Set(actions.map((action) => action.id)).size,
      actions.length,
    );
    await foreign.goto(`${base}/chat?conversation=${cid}`);
    await expect(foreign.locator('[data-visual="agent-actions"]')).toHaveCount(
      0,
    );
    await employee.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await employee.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const interruptedId = randomUUID();
    ids.push(interruptedId);
    const interrupted = await repository.begin(
      user,
      {
        requestId: randomUUID(),
        conversationId: interruptedId,
        text: "Teste de interrupção",
        startConversation: true,
      },
      "test-model",
    );
    await repository.recordAudit(interrupted, {
      id: randomUUID(),
      sequence: 1,
      tool: "searchKnowledgeBase",
      kind: "tool_result",
      intent: "knowledge",
      rationale: "Consulta registrada",
      parameters: {},
      at: new Date().toISOString(),
      state: "running",
      outcome: "failure",
      evidenceIds: [],
    });
    await db
      .collection<AgentRun>("agent_runs")
      .updateOne(
        { _id: interrupted._id },
        { $set: { expiresAt: new Date(0) } },
      );
    await repository.recover(interruptedId, user.uid);
    const recovered = await db
      .collection<AgentRun>("agent_runs")
      .findOne({ _id: interrupted._id });
    assert.equal(recovered?.state, "interrupted");
    assert.equal(recovered?.audit[0].state, "unknown");
    const interruptedConvo = await db
      .collection<Conversation>("conversations")
      .findOne({ _id: interruptedId });
    assert.ok(interruptedConvo);
    const interruptedRows = await db
      .collection<Message>("messages")
      .find({ conversationId: interruptedId })
      .toArray();
    const recoveredHistory = await readTransparency(
      interruptedConvo,
      interruptedRows,
      false,
    );
    assert.ok(
      recoveredHistory[0].actions?.every(
        (action) =>
          action.messageId === interrupted._id && action.state === "unknown",
      ),
    );
    console.log(
      "Transparency integration passed: real incremental streaming before tool completion, durable states, correlation, reload, replay, priority, confirmation, duplicates, unknown failure, handoff, analyst diagnostics, ownership and mobile.",
    );
  } catch (error) {
    console.error("Integration diagnostic", {
      mode,
      calls,
      emitted,
      page: (await diagnosticPage?.locator("body").innerText())?.slice(-2200),
      runs: (
        await db
          .collection<AgentRun>("agent_runs")
          .find({ customerId: user.uid })
          .toArray()
      ).map((run) => ({
        state: run.state,
        errorCode: run.errorCode,
        audit: run.audit.map((entry) => ({
          tool: entry.tool,
          state: entry.state,
          code: entry.code,
        })),
      })),
    });
    throw error;
  } finally {
    release();
    for (const stream of streams.values()) stream.controller.abort();
    await Promise.allSettled(
      [...streams.values()].map((stream) => stream.iterator.return(undefined)),
    );
    await browser.close();
    const ownedConversations = await db
      .collection<Conversation>("conversations")
      .find({ customerId: user.uid })
      .toArray();
    ids.push(...ownedConversations.map((conversation) => conversation._id));
    const ownedTickets = await db
      .collection<Ticket>("tickets")
      .find({ customerId: user.uid })
      .toArray();
    await db
      .collection("ticket_events")
      .deleteMany({
        ticketId: { $in: ownedTickets.map((ticket) => ticket._id) },
      });
    await db.collection<Ticket>("tickets").deleteMany({ customerId: user.uid });
    await db.collection("ticket_drafts").deleteMany({ customerId: user.uid });
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
      .deleteMany({ customerId: user.uid, _id: { $in: ids } });
    await Promise.all(accounts.map((uid) => auth.deleteUser(uid)));
    await db.client.close();
  }
}
main().catch((error) => {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Integration failed",
  );
  process.exitCode = 1;
});
