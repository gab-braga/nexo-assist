import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { RequestContext } from "@mastra/core/request-context";
import { Mastra } from "@mastra/core/mastra";
import { MemoryTickets } from "./helpers/ticket-memory";
import { createTicketService } from "../src/server/services/tickets";
import { createNexoTools } from "../src/server/ai/tools";
import { createNexoAgent } from "../src/server/ai/agents/nexo-agent";
import { NexoRunContext } from "../src/server/ai/context";
import { ConversationFlowSchema } from "../src/server/ai/schemas";
import { buildAgentMemory } from "../src/server/ai/memory";
import { knowledgeGuidance } from "../src/server/policies/knowledge-guidance";
import { demoArticles } from "../src/server/data/service-desk-demo";
import { AppError } from "../src/server/lib/errors";
import { scriptedModel, textParts, toolCall } from "./helpers/scripted-model";
import type { SessionUser, Conversation } from "../src/types/domain";
import type { AgentRun } from "../src/types/ai";
import type { TicketData } from "../src/types/tickets";

const data: TicketData = {
  title: "Notebook não liga",
  description: "Notebook não liga desde a manhã, sem equipamento alternativo.",
  type: "INC",
  category: "Hardware",
  impact: "person",
  urgency: "blocked",
};
const rationale = "Consultar e validar a solicitação do funcionário.";
function fixture() {
  const repository = new MemoryTickets();
  const user: SessionUser = {
    uid: "flow-a",
    name: "Ana",
    email: "ana@example.test",
    role: "chat",
  };
  let actor = user;
  let time = new Date("2026-10-29T13:00:00Z");
  let unavailable = false;
  const conversationId = randomUUID();
  const initial: Conversation = {
    _id: conversationId,
    customerId: user.uid,
    customerName: user.name,
    subject: "Notebook",
    status: "waiting",
    agentId: null,
    agentName: null,
    version: 0,
    aiEnabled: true,
    createdAt: time,
    updatedAt: time,
  };
  repository.conversations.set(conversationId, initial);
  const tickets = createTicketService({
    repository,
    authenticate: async () => actor,
    now: () => time,
    available: () => {
      if (unavailable)
        throw new AppError("TEMPORARILY_UNAVAILABLE", "Serviço indisponível.");
    },
  });
  const tools = createNexoTools({
    tickets,
    knowledge: async () =>
      demoArticles.filter((article) => article._id === "demo-vpn-809"),
  });
  const conversation = () => repository.conversations.get(conversationId)!;
  function next() {
    const run: AgentRun = {
      _id: randomUUID(),
      conversationId,
      customerId: user.uid,
      inputHash: "test",
      controlVersion: conversation().aiControlVersion ?? 0,
      state: "running",
      createdAt: time,
      expiresAt: new Date(time.getTime() + 60000),
      completedAt: null,
      response: null,
      responseId: randomUUID(),
      errorCode: null,
      model: "test",
      promptVersion: "test",
      audit: [],
      usage: null,
    };
    repository.runs.set(run._id, run);
    repository.conversations.set(conversationId, {
      ...conversation(),
      aiActiveRunId: run._id,
    });
    const scope = new NexoRunContext(
      user.uid,
      conversationId,
      run._id,
      new AbortController().signal,
      async () => actor,
      async () => {
        if (
          conversation().status !== "waiting" ||
          conversation().aiHandoff ||
          conversation().aiActiveRunId !== run._id
        )
          throw new AppError("HUMAN_CONTROL", "Atendimento humano.");
      },
      async (reason, summary) => {
        repository.conversations.set(conversationId, {
          ...conversation(),
          aiHandoff: true,
        });
        repository.conversationEvents.push({
          _id: randomUUID(),
          conversationId,
          actorId: user.uid,
          operation: "request_human",
          reason,
          summary,
          createdAt: time,
        });
      },
      async (patch) => {
        repository.conversations.set(conversationId, {
          ...conversation(),
          ...patch,
        });
      },
    );
    const requestContext = new RequestContext();
    requestContext.set("nexo", scope);
    return { run, scope, requestContext };
  }
  const idle = () =>
    repository.conversations.set(conversationId, {
      ...conversation(),
      aiActiveRunId: null,
    });
  const binding = (run: AgentRun) => ({ conversationId, runId: run._id });
  const prepare = async (value = data) => {
    const { run } = next();
    const draft = await tickets.prepareTicketChange(
      { operation: "create", data: value },
      binding(run),
    );
    idle();
    return { ...draft, conversationId };
  };
  const confirm = (draft: { draftId: string; digest: string }) =>
    tickets.confirmConversationDraft({
      conversationId,
      draftId: draft.draftId,
      digest: draft.digest,
    });
  return {
    repository,
    user,
    tickets,
    tools,
    next,
    idle,
    conversation,
    conversationId,
    binding,
    prepare,
    confirm,
    as: (value: SessionUser) => {
      actor = value;
    },
    at: (value: Date) => {
      time = value;
    },
    outage: (value: boolean) => {
      unavailable = value;
    },
  };
}

test("knowledge flow withholds Windows 10 procedures for unknown/Windows 11 and permits matching instructions", async () => {
  const article = demoArticles.find(
    (article) => article._id === "demo-vpn-809",
  )!;
  assert.equal(knowledgeGuidance(article).requiresEnvironment, true);
  assert.equal(knowledgeGuidance(article).content, null);
  assert.equal(knowledgeGuidance(article, "Windows 11").applicable, false);
  assert.equal(knowledgeGuidance(article, "Windows 11").content, null);
  assert.equal(knowledgeGuidance(article, "Linux").requiresEnvironment, false);
  assert.equal(knowledgeGuidance(article, "Linux").applicable, false);
  assert.ok(
    knowledgeGuidance(article, "Windows 10").content?.includes("reinstale"),
  );
  const f = fixture();
  const turn = f.next();
  const agent = createNexoAgent(
    scriptedModel([
      [toolCall("searchKnowledgeBase", { search: "809", rationale })],
      [
        toolCall("updateConversationFlow", {
          state: {
            intent: "knowledge",
            stage: "knowledge",
            question: "Qual a versão do Windows?",
            choices: [
              { label: "Windows 10", message: "Uso Windows 10" },
              { label: "Windows 11", message: "Uso Windows 11" },
            ],
          },
          rationale,
        }),
      ],
      textParts(
        "O artigo VPN com erro 809 depende do sistema. Qual a versão do Windows?",
      ),
    ]),
    f.tools,
  );
  new Mastra({ agents: { agent }, logger: false });
  const output = await agent.stream("Minha VPN apresenta erro 809.", {
    requestContext: turn.requestContext,
  });
  await output.text;
  assert.equal(f.conversation().flow?.choices?.length, 2);
  assert.equal(turn.scope.audit[0].tool, "searchKnowledgeBase");
});

test("natural-language ticket lookup persists multiple authorized choices and real latest update", async () => {
  const f = fixture();
  const a = await f.tickets.prepareTicketChange({ operation: "create", data });
  const ticket = await f.tickets.confirmTicketChange({
    draftId: a.draftId,
    digest: a.digest,
    token: a.token,
  });
  const b = await f.tickets.prepareTicketChange({
    operation: "create",
    data: {
      ...data,
      title: "Solicitação de monitor",
      type: "REQ",
      urgency: "normal",
    },
  });
  await f.tickets.confirmTicketChange({
    draftId: b.draftId,
    digest: b.digest,
    token: b.token,
  });
  const turn = f.next();
  const agent = createNexoAgent(
    scriptedModel([
      [toolCall("listUserTickets", { query: {}, rationale })],
      textParts("Qual desses chamados deseja consultar?"),
    ]),
    f.tools,
  );
  new Mastra({ agents: { agent }, logger: false });
  await (
    await agent.stream("Como estão meus chamados?", {
      requestContext: turn.requestContext,
    })
  ).text;
  assert.equal(f.conversation().flow?.stage, "selecting");
  assert.equal(
    (await f.tickets.getConversationInteraction(f.conversationId)).tickets
      .length,
    2,
  );
  const history = await f.tools.getTicketHistory.execute!(
    { ticketId: ticket._id, rationale },
    { requestContext: turn.requestContext },
  );
  assert.ok(history && "ok" in history && history.ok);
});

test("partial collection persists between Mastra turns, understands short answers and cannot inject security fields", async () => {
  const f = fixture();
  const turn = f.next();
  const partial = {
    intent: "create" as const,
    stage: "collecting" as const,
    data: {
      title: data.title,
      type: "INC" as const,
      category: "Hardware" as const,
      impact: "person" as const,
    },
    question: "Consegue trabalhar em outro equipamento?",
    choices: [
      { label: "Não", message: "Não consigo trabalhar em outro equipamento." },
    ],
  };
  await f.tools.updateConversationFlow.execute!(
    { state: partial, rationale },
    { requestContext: turn.requestContext },
  );
  assert.equal(f.repository.tickets.size, 0);
  const panel = await f.tickets.getConversationInteraction(f.conversationId);
  assert.equal(panel.flow?.data?.impact, "person");
  const memory = buildAgentMemory({
    initialMessage: null,
    recentMessages: [
      {
        _id: "current",
        conversationId: f.conversationId,
        authorId: f.user.uid,
        authorName: "Ana",
        role: "chat",
        text: "Não.",
        createdAt: new Date(),
      },
    ],
    selectedTicket: null,
    pendingOperation: null,
    flow: panel.flow!,
  });
  assert.ok(JSON.stringify(memory).includes(partial.question));
  assert.equal(
    ConversationFlowSchema.safeParse({ ...partial, customerId: "other" })
      .success,
    false,
  );
  assert.equal(
    ConversationFlowSchema.safeParse({ ...partial, data: { priority: "low" } })
      .success,
    false,
  );
});

test("complete draft remains read-only until explicit bound confirmation; concurrent clicks produce one receipt", async () => {
  const f = fixture();
  const turn = f.next();
  const output = await f.tools.prepareTicketDraft.execute!(
    { change: { operation: "create", data }, rationale },
    { requestContext: turn.requestContext },
  );
  assert.ok(output && "ok" in output && output.ok);
  assert.equal(f.repository.tickets.size, 0);
  assert.ok(!JSON.stringify(output).includes('"token"'));
  assert.ok(!JSON.stringify(output).includes('"digest"'));
  assert.equal("confirmConversationDraft" in f.tools, false);
  const panel = await f.tickets.getConversationInteraction(f.conversationId);
  assert.equal(panel.canConfirm, false);
  await assert.rejects(
    () => f.confirm(panel.draft!),
    (error: unknown) =>
      error instanceof AppError && error.code === "RUN_IN_PROGRESS",
  );
  f.idle();
  const results = await Promise.all([
    f.confirm(panel.draft!),
    f.confirm(panel.draft!),
  ]);
  assert.equal(results[0]._id, results[1]._id);
  assert.equal(results[0].priority, "high");
  assert.equal(f.repository.tickets.size, 1);
  assert.equal(f.repository.messages.length, 1);
  assert.equal(f.repository.messages[0].ticket?._id, results[0]._id);
  assert.equal(
    f.repository.conversationEvents.filter(
      (event) => event.operation === "ticket_confirmed",
    ).length,
    1,
  );
});

test("replacement invalidates previous confirmation; cancellation never creates a ticket", async () => {
  const f = fixture();
  const old = await f.prepare();
  const updated = await f.prepare({ ...data, urgency: "workaround" });
  await assert.rejects(
    () => f.confirm(old),
    (error: unknown) =>
      error instanceof AppError && error.code === "CONFIRMATION_CANCELLED",
  );
  await f.tickets.cancelConversationDraft({
    conversationId: f.conversationId,
    draftId: updated.draftId,
    digest: updated.digest,
  });
  await assert.rejects(() => f.confirm(updated));
  assert.equal(f.repository.tickets.size, 0);
  assert.equal(f.conversation().pendingDraftId, null);
});

test("update appends employee information, requires confirmation and preserves prior history/deadline", async () => {
  const f = fixture();
  const original = await f.confirm(await f.prepare());
  const turn = f.next();
  const proposal = await f.tickets.prepareTicketChange(
    {
      operation: "update",
      ticketId: original._id,
      version: original.version,
      data: {
        ...data,
        description: "O erro continua mesmo depois de reiniciar.",
      },
    },
    f.binding(turn.run),
  );
  assert.ok(proposal.data.description.startsWith(data.description));
  assert.ok(proposal.data.description.includes("depois de reiniciar"));
  assert.equal(
    (await f.tickets.getTicket(original._id)).description,
    data.description,
  );
  f.idle();
  const updated = await f.confirm(proposal);
  assert.equal(updated.nextResponseDueAt, original.nextResponseDueAt);
  assert.equal((await f.tickets.getTicketHistory(original._id)).length, 2);
});

test("reopen validates exact seven-day boundary and rejects out-of-window at preparation and confirmation", async () => {
  const f = fixture();
  const ticket = await f.confirm(await f.prepare());
  f.as({ ...f.user, role: "agent" });
  const resolved = await f.tickets.resolveTicket({
    ticketId: ticket._id,
    version: ticket.version,
    reason: "Problema corrigido.",
  });
  f.as(f.user);
  const limit = new Date(
    new Date(resolved.resolvedAt!).getTime() + 7 * 86400000,
  );
  f.at(limit);
  const turn = f.next();
  const draft = await f.tickets.prepareTicketChange(
    { operation: "reopen", ticketId: ticket._id, version: resolved.version },
    f.binding(turn.run),
  );
  f.idle();
  f.at(new Date(limit.getTime() + 1));
  await assert.rejects(
    () => f.confirm(draft),
    (error: unknown) =>
      error instanceof AppError && error.code === "REOPEN_WINDOW_EXPIRED",
  );
  const next = f.next();
  await assert.rejects(() =>
    f.tickets.prepareTicketChange(
      { operation: "reopen", ticketId: ticket._id, version: resolved.version },
      f.binding(next.run),
    ),
  );
  f.at(limit);
  const valid = f.next();
  const permitted = await f.tickets.prepareTicketChange(
    { operation: "reopen", ticketId: ticket._id, version: resolved.version },
    f.binding(valid.run),
  );
  f.idle();
  assert.equal((await f.confirm(permitted)).status, "open");
});

test("duplicates are offered for selection and rejected again if another creation wins after preparation", async () => {
  const f = fixture();
  const pending = await f.prepare();
  const competing = await f.tickets.prepareTicketChange({
    operation: "create",
    data,
  });
  await f.tickets.confirmTicketChange({
    draftId: competing.draftId,
    digest: competing.digest,
    token: competing.token,
  });
  await assert.rejects(
    () => f.confirm(pending),
    (error: unknown) =>
      error instanceof AppError && error.code === "DUPLICATE_TICKET",
  );
  const turn = f.next();
  await f.tools.findDuplicateTickets.execute!(
    { data, rationale },
    { requestContext: turn.requestContext },
  );
  assert.equal(f.conversation().flow?.ticketIds?.length, 1);
  await assert.rejects(() =>
    f.tickets.prepareTicketChange(
      { operation: "create", data },
      f.binding(turn.run),
    ),
  );
});

test("foreign owner, altered digest, other conversation, expired draft and analyst fencing cannot confirm", async () => {
  const f = fixture();
  const draft = await f.prepare();
  await assert.rejects(() => f.confirm({ ...draft, digest: "0".repeat(64) }));
  await assert.rejects(() =>
    f.tickets.confirmConversationDraft({
      conversationId: randomUUID(),
      draftId: draft.draftId,
      digest: draft.digest,
    }),
  );
  f.as({ ...f.user, uid: "other" });
  await assert.rejects(() => f.confirm(draft));
  await assert.rejects(() =>
    f.tickets.getConversationInteraction(f.conversationId),
  );
  f.as(f.user);
  f.repository.conversations.set(f.conversationId, {
    ...f.conversation(),
    aiControlVersion: 1,
  });
  await assert.rejects(
    () => f.confirm(draft),
    (error: unknown) =>
      error instanceof AppError && error.code === "HUMAN_CONTROL",
  );
  f.repository.conversations.set(f.conversationId, {
    ...f.conversation(),
    aiControlVersion: 0,
  });
  f.at(new Date(draft.expiresAt));
  await assert.rejects(
    () => f.confirm(draft),
    (error: unknown) =>
      error instanceof AppError && error.code === "CONFIRMATION_EXPIRED",
  );
});

test("service outage and failed result persistence leave proposal retryable without claiming success", async () => {
  const f = fixture();
  const draft = await f.prepare();
  f.outage(true);
  await assert.rejects(() => f.confirm(draft));
  assert.equal(f.repository.tickets.size, 0);
  f.outage(false);
  f.repository.failEvent = true;
  await assert.rejects(() => f.confirm(draft));
  assert.equal(f.repository.tickets.size, 0);
  f.repository.failEvent = false;
  assert.equal((await f.confirm(draft)).status, "open");
  assert.equal(
    (await f.confirm(draft))._id,
    f.repository.messages[0].ticket?._id,
  );
});

test("critical confirmation and overdue lookup identify human escalation without simulating analyst assignment", async () => {
  const f = fixture();
  const ticket = await f.confirm(await f.prepare({ ...data, impact: "team" }));
  assert.equal(ticket.priority, "critical");
  assert.equal(f.conversation().aiHandoff, true);
  assert.equal(f.conversation().agentId, null);
  assert.equal(f.repository.conversationEvents.at(-1)?.reason, "critical");
  const g = fixture();
  const normal = await g.confirm(await g.prepare());
  g.at(new Date(new Date(normal.nextResponseDueAt).getTime() + 1));
  const turn = g.next();
  const result = await g.tools.getTicketStatus.execute!(
    { ticketId: normal._id, rationale },
    { requestContext: turn.requestContext },
  );
  assert.ok(JSON.stringify(result).includes('"handoffReason":"overdue"'));
  await g.tools.requestHumanHandoff.execute!(
    {
      reason: "overdue",
      summary: "Chamado de notebook com prazo vencido.",
      rationale,
    },
    { requestContext: turn.requestContext },
  );
  assert.equal(g.conversation().aiHandoff, true);
});
