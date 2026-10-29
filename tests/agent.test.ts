import { test } from "node:test";
import assert from "node:assert/strict";
import { RequestContext } from "@mastra/core/request-context";
import { Mastra } from "@mastra/core/mastra";
import { createNexoAgent } from "../src/server/ai/agents/nexo-agent";
import { createNexoTools } from "../src/server/ai/tools";
import { NexoRunContext } from "../src/server/ai/context";
import { createTicketService } from "../src/server/services/tickets";
import { AppError } from "../src/server/lib/errors";
import { MemoryTickets } from "./helpers/ticket-memory";
import { scriptedModel, textParts, toolCall } from "./helpers/scripted-model";
import { demoArticles } from "../src/server/data/service-desk-demo";
import { validateAgentRequest, readAgentBody } from "../src/server/ai/http";
import { AgentTurnSchema } from "../src/server/ai/schemas";
import { AI_LIMITS } from "../src/server/ai/config";
import {
  assertAgentConversation,
  type AgentRunRepository,
} from "../src/server/repositories/agent-runs";
import {
  createAgentTurnService,
  recentAgentContext,
  agentError,
  providerFailureMetadata,
} from "../src/server/services/agent-turns";
import { consumeAgentStream } from "../src/lib/agent-stream";
import type {
  SessionUser,
  Conversation,
  Message,
  ConversationContextPatch,
} from "../src/types/domain";
import type { AgentRun, AgentStreamEvent } from "../src/types/ai";
import type { TicketData } from "../src/types/tickets";

const user: SessionUser = {
  uid: "customer-a",
  name: "Ana",
  email: "ana@example.test",
  role: "chat",
};
const conversationId = "c0000000-0000-4000-8000-000000000001";
const rationale = "Consultar os dados solicitados pelo funcionário.";
const data: TicketData = {
  title: "VPN erro 809",
  description: "Windows 11 não conecta à rede da empresa.",
  type: "INC",
  category: "Rede e VPN",
  impact: "person",
  urgency: "blocked",
};
function fixture() {
  const repository = new MemoryTickets();
  let actor = user;
  let outage = false;
  let active = true;
  let handoff = false;
  let remembered: ConversationContextPatch = {};
  const authenticate = async () => actor;
  const tickets = createTicketService({
    repository,
    authenticate,
    now: () => new Date("2026-10-29T13:00:00Z"),
    available: () => {
      if (outage)
        throw new AppError(
          "TEMPORARILY_UNAVAILABLE",
          "Serviço temporariamente indisponível.",
        );
    },
  });
  const tools = createNexoTools({
    tickets,
    knowledge: async () =>
      demoArticles.filter((article) => article._id === "demo-vpn-809"),
  });
  const scope = new NexoRunContext(
    user.uid,
    conversationId,
    crypto.randomUUID(),
    new AbortController().signal,
    authenticate,
    async () => {
      if (!active) throw new AppError("HUMAN_CONTROL", "Atendimento humano.");
    },
    async () => {
      handoff = true;
    },
    async (patch) => {
      remembered = { ...remembered, ...patch };
    },
  );
  const requestContext = new RequestContext();
  repository.conversations.set(conversationId, {
    _id: conversationId,
    customerId: user.uid,
    customerName: user.name,
    subject: "Teste",
    status: "waiting",
    agentId: null,
    agentName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    aiEnabled: true,
    aiActiveRunId: scope.runId,
  });
  repository.runs.set(scope.runId, {
    _id: scope.runId,
    conversationId,
    customerId: user.uid,
    controlVersion: 0,
    state: "running",
    expiresAt: new Date("2099-01-01"),
    createdAt: new Date(),
    completedAt: null,
    inputHash: "test",
    response: null,
    responseId: crypto.randomUUID(),
    errorCode: null,
    model: "test",
    promptVersion: "test",
    audit: [],
    usage: null,
  });
  requestContext.set("nexo", scope);
  return {
    tools,
    scope,
    requestContext,
    repository,
    tickets,
    authenticate,
    as: (value: SessionUser) => {
      actor = value;
    },
    outage: () => {
      outage = true;
    },
    pause: () => {
      active = false;
    },
    handedOff: () => handoff,
    remembered: () => remembered,
  };
}

test("tools refuse missing/forged server identity and enforce human control", async () => {
  const f = fixture();
  const input = { search: "VPN", rationale };
  const missing = await f.tools.searchKnowledgeBase.execute!(input, {});
  assert.equal(missing && "ok" in missing && missing.ok, false);
  f.as({ ...user, uid: "other" });
  const forged = await f.tools.searchKnowledgeBase.execute!(input, {
    requestContext: f.requestContext,
  });
  assert.equal(forged && "code" in forged && forged.code, "FORBIDDEN");
  f.as(user);
  f.pause();
  const paused = await f.tools.listUserTickets.execute!(
    { query: { search: "", overdue: false, limit: 5 }, rationale },
    { requestContext: f.requestContext },
  );
  assert.equal(paused && "code" in paused && paused.code, "HUMAN_CONTROL");
});

test("tool contracts reject injected identity and record sanitized real errors", async () => {
  const f = fixture();
  const invalid = await f.tools.listUserTickets.inputSchema![
    "~standard"
  ].validate({
    query: { search: "", overdue: false, limit: 5, customerId: "other" },
    rationale,
  });
  assert.ok(invalid.issues?.length);
  f.outage();
  const failure = await f.tools.listUserTickets.execute!(
    { query: { search: "", overdue: false, limit: 5 }, rationale },
    { requestContext: f.requestContext },
  );
  assert.equal(
    failure && "code" in failure && failure.code,
    "TEMPORARILY_UNAVAILABLE",
  );
  assert.equal(f.scope.audit.at(-1)?.outcome, "failure");
});

test("draft tool never reveals confirmation capability or executes ticket mutation", async () => {
  const f = fixture();
  const output = await f.tools.prepareTicketDraft.execute!(
    { change: { operation: "create", data }, rationale },
    { requestContext: f.requestContext },
  );
  const json = JSON.stringify(output);
  assert.doesNotMatch(json, /"token"|"digest"|tokenHash/);
  assert.equal(f.repository.tickets.size, 0);
  assert.equal(f.repository.drafts.size, 1);
  assert.ok(f.remembered().pendingDraftId);
  assert.match(f.scope.draftSummary!, /Nenhum chamado foi criado/);
  assert.equal("createTicket" in f.tools, false);
  assert.equal("confirmTicketChange" in f.tools, false);
});

test("tool budget is enforced across all selected tools", async () => {
  const f = fixture();
  for (let i = 0; i < 9; i++)
    await f.tools.recordDecision.execute!(
      { intent: "clarify", rationale },
      { requestContext: f.requestContext },
    );
  assert.equal(f.scope.audit.at(-1)?.code, "TOOL_LIMIT");
});

test("aborted execution blocks tools and provider diagnostics omit credentials/body", async () => {
  const f = fixture();
  const aborted = new NexoRunContext(
    user.uid,
    conversationId,
    crypto.randomUUID(),
    AbortSignal.abort(),
    f.authenticate,
    async () => {},
    async () => {},
    async () => {},
  );
  const context = new RequestContext();
  context.set("nexo", aborted);
  const result = await f.tools.recordDecision.execute!(
    { intent: "clarify", rationale },
    { requestContext: context },
  );
  assert.equal(result && "code" in result && result.code, "TIMEOUT");
  const metadata = providerFailureMetadata(
    Object.assign(new Error("SECRET"), {
      statusCode: 429,
      responseBody: JSON.stringify({
        error: { code: "credit_balance_exhausted", message: "SECRET KEY" },
      }),
    }),
  );
  assert.deepEqual(metadata, {
    kind: "Error",
    status: 429,
    providerCode: "credit_balance_exhausted",
  });
  assert.doesNotMatch(JSON.stringify(metadata), /SECRET/);
});

test("Mastra routes scripted tool calls through real ticket services and records evidence", async () => {
  const f = fixture();
  const draft = await f.tickets.prepareTicketChange({
    operation: "create",
    data,
  });
  const ticket = await f.tickets.confirmTicketChange({
    draftId: draft.draftId,
    digest: draft.digest,
    token: draft.token,
  });
  f.as({ ...user, uid: "another-employee" });
  const otherDraft = await f.tickets.prepareTicketChange({
    operation: "create",
    data: { ...data, description: "Informação privada do outro funcionário." },
  });
  const otherTicket = await f.tickets.confirmTicketChange({
    draftId: otherDraft.draftId,
    digest: otherDraft.digest,
    token: otherDraft.token,
  });
  f.as(user);
  const scenarios = [
    {
      name: "VPN",
      tool: "searchKnowledgeBase",
      input: { search: "VPN", rationale },
      answer: "Qual versão do Windows você usa?",
      success: true,
    },
    {
      name: "meus chamados",
      tool: "listUserTickets",
      input: { query: { search: "", overdue: false, limit: 5 }, rationale },
      answer: "Localizei seu chamado de VPN.",
      success: true,
    },
    {
      name: "detalhes",
      tool: "getTicketDetails",
      input: { ticketId: ticket._id, rationale },
      answer: "O chamado está aberto.",
      success: true,
    },
    {
      name: "status",
      tool: "getTicketStatus",
      input: { ticketId: ticket._id, rationale },
      answer: "O prazo consultado é de primeira resposta.",
      success: true,
    },
    {
      name: "outro funcionário",
      tool: "getTicketDetails",
      input: { ticketId: otherTicket._id, rationale },
      answer: "Chamado não encontrado.",
      success: false,
    },
  ];
  for (const scenario of scenarios) {
    f.scope.calls = 0;
    const agent = createNexoAgent(
      scriptedModel([
        [toolCall(scenario.tool, scenario.input)],
        textParts(scenario.answer),
      ]),
      f.tools,
    );
    new Mastra({ agents: { agent }, logger: false });
    const output = await agent.stream(scenario.name, {
      requestContext: f.requestContext,
      maxSteps: 3,
    });
    await output.consumeStream();
    assert.equal(await output.text, scenario.answer);
    assert.equal(f.scope.audit.at(-1)?.tool, scenario.tool);
    assert.equal(
      f.scope.audit.at(-1)?.outcome,
      scenario.success ? "success" : "failure",
    );
  }
});

test("Mastra clarifies missing data, redirects outside IT and prepares instead of writing", async () => {
  for (const intent of ["clarify", "out_of_scope"] as const) {
    const f = fixture();
    const agent = createNexoAgent(
      scriptedModel([
        [toolCall("recordDecision", { intent, rationale })],
        textParts(
          intent === "clarify"
            ? "Quantas pessoas foram afetadas?"
            : "Procure o setor de RH responsável.",
        ),
      ]),
      f.tools,
    );
    new Mastra({ agents: { agent }, logger: false });
    const output = await agent.stream(
      intent === "clarify" ? "Abra um chamado" : "Quero minhas férias",
      { requestContext: f.requestContext },
    );
    await output.consumeStream();
    assert.equal(f.scope.audit[0].intent, intent);
    assert.equal(f.repository.tickets.size, 0);
  }
  const f = fixture();
  const agent = createNexoAgent(
    scriptedModel([
      [
        toolCall("prepareTicketDraft", {
          change: { operation: "create", data },
          rationale,
        }),
      ],
      textParts("Rascunho preparado; aguarda confirmação."),
    ]),
    f.tools,
  );
  new Mastra({ agents: { agent }, logger: false });
  const output = await agent.stream("Preparar chamado de VPN", {
    requestContext: f.requestContext,
  });
  await output.consumeStream();
  assert.equal(f.repository.drafts.size, 1);
  assert.equal(f.repository.tickets.size, 0);
});

test("human handoff pauses further tool execution and records an observable result", async () => {
  const f = fixture();
  const result = await f.tools.requestHumanHandoff.execute!(
    {
      reason: "requested",
      summary: "Funcionário pediu para falar com um analista.",
      rationale,
    },
    { requestContext: f.requestContext },
  );
  assert.ok(result && "ok" in result && result.ok);
  assert.equal(f.handedOff(), true);
  assert.equal(f.scope.handoffRequested, true);
  const blocked = await f.tools.searchKnowledgeBase.execute!(
    { search: "VPN", rationale },
    { requestContext: f.requestContext },
  );
  assert.equal(blocked && "code" in blocked && blocked.code, "HUMAN_CONTROL");
});

test("HTTP rejects foreign origins, missing origin and oversized streamed bodies", async () => {
  const make = (origin?: string) =>
    new Request("https://nexo.example/api/agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(origin ? { Origin: origin } : {}),
      },
      body: "{}",
    });
  assert.throws(() => validateAgentRequest(make("https://evil.example")));
  assert.throws(() => validateAgentRequest(make()));
  assert.doesNotThrow(() => validateAgentRequest(make("https://nexo.example")));
  await assert.rejects(() =>
    readAgentBody(
      new Request("https://nexo.example", {
        method: "POST",
        body: "x".repeat(20001),
      }),
    ),
  );
  assert.equal(
    AgentTurnSchema.safeParse({
      requestId: crypto.randomUUID(),
      conversationId,
      text: "ajuda",
      userId: "other",
    }).success,
    false,
  );
});

test("context, conversation ownership, operational state and control fencing are independent", () => {
  const conversation: Conversation = {
    _id: conversationId,
    customerId: user.uid,
    customerName: user.name,
    subject: "Ajuda",
    status: "waiting",
    agentId: null,
    agentName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    aiEnabled: true,
  };
  assert.doesNotThrow(() => assertAgentConversation(conversation, user.uid));
  assert.throws(() => assertAgentConversation(conversation, "other"));
  assert.throws(() =>
    assertAgentConversation({ ...conversation, status: "active" }, user.uid),
  );
  assert.throws(() =>
    assertAgentConversation({ ...conversation, aiHandoff: true }, user.uid),
  );
  assert.throws(() =>
    assertAgentConversation(
      { ...conversation, aiActiveRunId: "run", aiControlVersion: 2 },
      user.uid,
      { _id: "run", controlVersion: 1 } as AgentRun,
    ),
  );
  const messages: Message[] = Array.from({ length: 30 }, (_, i) => ({
    _id: String(i),
    conversationId,
    authorId: user.uid,
    authorName: user.name,
    role: "chat",
    text: "x".repeat(8000),
    createdAt: new Date(),
  }));
  const context = recentAgentContext(messages);
  assert.ok(JSON.stringify(context).length < AI_LIMITS.contextChars + 1000);
  assert.ok(context.every((message) => message.role === "user"));
});

test("NDJSON consumer handles split UTF-8 chunks and requires a terminal result", async () => {
  const message = {
    _id: crypto.randomUUID(),
    conversationId,
    authorId: "nexo-assist",
    authorName: "Nexo Assist",
    role: "assistant" as const,
    text: "Olá",
    createdAt: new Date().toISOString(),
  };
  const bytes = new TextEncoder().encode(
    JSON.stringify({ type: "delta", text: "Olá" }) +
      "\n" +
      JSON.stringify({ type: "completed", message }) +
      "\n",
  );
  const received: AgentStreamEvent[] = [];
  await consumeAgentStream(
    new Response(
      new ReadableStream({
        start(controller) {
          for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
          controller.close();
        },
      }),
    ),
    (event) => received.push(event),
  );
  assert.equal(received.length, 2);
  await assert.rejects(() =>
    consumeAgentStream(
      new Response(JSON.stringify({ type: "delta", text: "parcial" }) + "\n"),
      () => {},
    ),
  );
});

test("turn service streams and persists final output; replay does not invoke the model", async () => {
  const f = fixture();
  const now = new Date();
  const run: AgentRun = {
    _id: crypto.randomUUID(),
    conversationId,
    customerId: user.uid,
    inputHash: "hash",
    controlVersion: 0,
    state: "running",
    createdAt: now,
    expiresAt: new Date(now.getTime() + 60000),
    completedAt: null,
    response: null,
    responseId: crypto.randomUUID(),
    errorCode: null,
    model: "test",
    promptVersion: "test",
    audit: [],
    usage: null,
  };
  const history: Message[] = [
    {
      _id: run._id,
      conversationId,
      authorId: user.uid,
      authorName: user.name,
      role: "chat",
      text: "Ajuda VPN",
      createdAt: now,
    },
  ];
  const repo: AgentRunRepository = {
    recordAudit: async (_run, entry) => entry,
    begin: async () => run,
    loadContext: async () => ({
      initialMessage: history[0],
      recentMessages: history,
      selectedTicket: null,
      pendingOperation: null,
    }),
    remember: async () => {},
    recover: async () => false,
    assertActive: async () => {},
    handoff: async () => {},
    finish: async (_run, text, audit, usage, code) => {
      run.audit = audit;
      run.usage = usage;
      run.response = text;
      run.errorCode = code ?? null;
      run.state = text
        ? "completed"
        : ["RUN_INTERRUPTED", "TIMEOUT", "HUMAN_CONTROL"].includes(code ?? "")
          ? "interrupted"
          : "failed";
      return text
        ? {
            ...history[0],
            _id: run.responseId,
            authorId: "nexo-assist",
            authorName: "Nexo Assist",
            role: "assistant",
            text,
          }
        : null;
    },
  };
  let invocations = 0;
  const agent = createNexoAgent(
    scriptedModel([textParts("Qual erro aparece na VPN?")]),
    f.tools,
  );
  new Mastra({ agents: { agent }, logger: false });
  const start = createAgentTurnService({
    authenticate: f.authenticate,
    repository: repo,
    configured: () => {},
    agent: async () => {
      invocations++;
      return agent;
    },
  });
  const input = { requestId: run._id, conversationId, text: "Ajuda VPN" };
  const events = [];
  for await (const event of await start(input, new AbortController().signal))
    events.push(event);
  assert.ok(events.some((event) => event.type === "delta"));
  assert.equal(events.at(-1)?.type, "completed");
  assert.ok(run.usage);
  for await (const event of await start(input, new AbortController().signal))
    assert.notEqual(event.type, "delta");
  assert.equal(invocations, 1);
  assert.equal(
    agentError(new Error("SECRET provider body")).error.includes("SECRET"),
    false,
  );
  run.state = "running";
  run.response = null;
  const failing = createNexoAgent(
    scriptedModel([
      [
        {
          type: "error",
          error: Object.assign(new Error("SECRET provider body"), {
            statusCode: 429,
            responseBody: JSON.stringify({
              error: { code: "credit_balance_exhausted" },
            }),
          }),
        },
      ],
    ]),
    f.tools,
  );
  new Mastra({ agents: { failing }, logger: false });
  const retry = createAgentTurnService({
    authenticate: f.authenticate,
    repository: repo,
    configured: () => {},
    agent: async () => failing,
  });
  const failures = [];
  for await (const event of await retry(input, new AbortController().signal))
    failures.push(event);
  const terminal = failures.at(-1);
  assert.ok(terminal?.type === "error");
  assert.equal(terminal.code, "AI_PROVIDER_LIMIT");
  assert.equal(run.state, "failed");
  assert.equal(run.response, null);

  // Closing immediately after reservation must release the run without a model call.
  run.state = "running";
  const callsBeforeClose = invocations;
  const closed = await start(input, new AbortController().signal);
  assert.equal((await closed.next()).value?.type, "started");
  await closed.return(undefined);
  assert.equal(run.state, "interrupted");
  assert.equal(invocations, callsBeforeClose);

  // A disconnect after a preview must not save that preview or repeat the model.
  run.state = "running";
  const controller = new AbortController();
  const previewAgent = createNexoAgent(
    scriptedModel([textParts("Uma resposta parcial de teste.")]),
    f.tools,
  );
  new Mastra({ agents: { previewAgent }, logger: false });
  let previewCalls = 0;
  const previewStart = createAgentTurnService({
    authenticate: f.authenticate,
    repository: repo,
    configured: () => {},
    agent: async () => {
      previewCalls++;
      return previewAgent;
    },
  });
  const preview = await previewStart(input, controller.signal);
  await preview.next();
  assert.equal((await preview.next()).value?.type, "delta");
  controller.abort();
  const stopped = await preview.next();
  assert.ok(stopped.value?.type === "error");
  assert.equal(stopped.value.code, "RUN_INTERRUPTED");
  await preview.next();
  assert.equal(run.state, "interrupted");
  assert.equal(run.response, null);
  for await (const event of await previewStart(
    input,
    new AbortController().signal,
  ))
    assert.notEqual(event.type, "delta");
  assert.equal(previewCalls, 1);
});
