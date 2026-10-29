import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import type { Conversation, Message, SessionUser } from "../src/types/domain";
import type { AgentRun } from "../src/types/ai";
import type { Ticket, TicketDraft, TicketData } from "../src/types/tickets";
loadEnvConfig(process.cwd());

async function main() {
  const { database } = await import("../src/server/lib/mongodb");
  const { agentRunRepository: runs } =
    await import("../src/server/repositories/agent-runs");
  const { transferToHuman } =
    await import("../src/server/repositories/handoff");
  const {
    applyConversationTransition: transition,
    appendMessage,
    findConversation,
  } = await import("../src/server/repositories/conversations");
  const { createTicketService } =
    await import("../src/server/services/tickets");
  const { ticketRepository } =
    await import("../src/server/repositories/tickets");
  const { createAgentTurnService } =
    await import("../src/server/services/agent-turns");
  const { createNexoAgent } =
    await import("../src/server/ai/agents/nexo-agent");
  const { createNexoTools } = await import("../src/server/ai/tools");
  const { conversationState } = await import("../src/auth/conversation-state");
  const { canReadConversation, canSendMessage } =
    await import("../src/auth/policy");
  const { AppError } = await import("../src/server/lib/errors");
  const { scriptedModel, textParts, toolCall } =
    await import("./helpers/scripted-model");
  const { Mastra } = await import("@mastra/core/mastra");
  const db = await database();
  const user: SessionUser = {
    uid: `handoff-test-${randomUUID()}`,
    name: "Funcionário temporário",
    role: "chat",
    email: "test@example.test",
  };
  const analysts: SessionUser[] = ["a", "b"].map((key) => ({
    ...user,
    uid: `${user.uid}-${key}`,
    name: `Analista ${key}`,
    role: "agent",
  }));
  const ids = Array.from({ length: 5 }, () => randomUUID());
  const service = createTicketService({
    repository: ticketRepository,
    authenticate: async () => user,
    now: () => new Date(),
    available: () => {},
  });
  const tools = createNexoTools({
    tickets: service,
    knowledge: async () => [],
  });
  const data: TicketData = {
    title: "Notebook sem energia",
    description: "Notebook não liga e não há alternativa para trabalhar.",
    type: "INC",
    category: "Hardware",
    impact: "person",
    urgency: "blocked",
  };
  let calls = 0;
  async function start(
    conversationId: string,
    text: string,
    steps: Parameters<typeof scriptedModel>[0],
    first = false,
    capture?: (prompt: string) => void,
  ) {
    const agent = createNexoAgent(
      scriptedModel(steps, (options) => {
        calls++;
        capture?.(JSON.stringify(options.prompt));
      }),
      tools,
    );
    new Mastra({ agents: { agent }, logger: false });
    const input = {
      requestId: randomUUID(),
      conversationId,
      text,
      ...(first ? { startConversation: true } : {}),
    };
    const execute = createAgentTurnService({
      repository: runs,
      authenticate: async () => user,
      configured: () => {},
      agent: async () => agent,
    });
    const events = [];
    for await (const event of await execute(
      input,
      new AbortController().signal,
    ))
      events.push(event);
    return { input, events };
  }
  async function send(
    actor: SessionUser,
    conversationId: string,
    text: string,
  ) {
    const message: Message = {
      _id: randomUUID(),
      conversationId,
      authorId: actor.uid,
      authorName: actor.name,
      role: actor.role,
      text,
      createdAt: new Date(),
    };
    await appendMessage(message, (conversation, existing) => {
      if (
        !conversation ||
        !canReadConversation(actor, conversation) ||
        (!existing && !canSendMessage(actor, conversation))
      )
        throw new AppError("FORBIDDEN", "Denied");
    });
    return message;
  }
  try {
    const proposal = await service.prepareTicketChange({
      operation: "create",
      data,
    });
    const ticket = await service.confirmTicketChange({
      draftId: proposal.draftId,
      digest: proposal.digest,
      token: proposal.token,
    });
    const requested = await start(
      ids[0],
      "Preciso conversar com uma pessoa sobre o notebook.",
      [
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
            rationale: "Respeitar a solicitação contextual do funcionário.",
          }),
        ],
        textParts("FORBIDDEN LATE MODEL RESPONSE"),
      ],
      true,
    );
    assert.equal(requested.events.at(-1)?.type, "completed");
    assert.equal(calls, 2);
    let conversation = (await findConversation(ids[0]))!;
    assert.equal(conversationState(conversation), "WAITING_FOR_ANALYST");
    assert.equal(conversation.handoff?.reason, "requested");
    assert.equal(
      conversation.handoff?.summary.relatedTickets[0].id,
      ticket._id,
    );
    assert.ok(!JSON.stringify(requested.events).includes("FORBIDDEN LATE"));
    const oldRun = (await db
      .collection<AgentRun>("agent_runs")
      .findOne({ _id: requested.input.requestId }))!;
    await runs.handoff(
      oldRun,
      "requested",
      "Mesmo pedido de atendimento humano.",
    );
    assert.equal(
      await db
        .collection("conversation_events")
        .countDocuments({ conversationId: ids[0], operation: "request_human" }),
      1,
    );
    assert.equal(
      await runs.finish(oldRun, "FORBIDDEN LATE SAVE", [], null),
      null,
    );
    await assert.rejects(() => runs.assertActive(oldRun));
    const beforeBlocked = calls;
    await assert.rejects(() =>
      start(ids[0], "Ainda aguardando.", [textParts("FORBIDDEN")]),
    );
    assert.equal(calls, beforeBlocked);
    await send(user, ids[0], "Posso aguardar o analista.");

    const attempts = analysts.map((actor) => ({
      actor,
      input: {
        requestId: randomUUID(),
        conversationId: ids[0],
        version: conversation.version + 1,
        operation: "assume" as const,
      },
    }));
    const claims = await Promise.allSettled(
      attempts.map((attempt) => transition(attempt.actor, attempt.input)),
    );
    assert.equal(
      claims.filter((result) => result.status === "fulfilled").length,
      1,
    );
    const winner =
      attempts[claims.findIndex((result) => result.status === "fulfilled")];
    const other = analysts.find((actor) => actor.uid !== winner.actor.uid)!;
    await transition(winner.actor, winner.input);
    conversation = (await findConversation(ids[0]))!;
    assert.equal(conversationState(conversation), "ANALYST_ACTIVE");
    assert.ok(conversation.assignedAt);
    assert.equal(
      await db
        .collection("conversation_events")
        .countDocuments({
          conversationId: ids[0],
          operation: "assume",
          outcome: "success",
        }),
      1,
    );
    await assert.rejects(() => send(other, ids[0], "Não permitido"));
    await assert.rejects(() =>
      transition(other, {
        conversationId: ids[0],
        version: conversation.version,
        operation: "close",
      }),
    );
    const rejected = await db
      .collection("conversation_events")
      .findOne({
        conversationId: ids[0],
        actorId: other.uid,
        operation: "close",
        outcome: "failure",
      });
    assert.equal(rejected?.previousState, rejected?.newState);
    assert.equal(rejected?.code, "FORBIDDEN");
    await assert.rejects(() =>
      transition(user, {
        conversationId: ids[0],
        version: conversation.version,
        operation: "return_to_ai",
      }),
    );
    await send(
      winner.actor,
      ids[0],
      "Verifiquei a fonte; teste uma tomada diferente antes de ligar.",
    );
    await send(user, ids[0], "A tomada já foi testada.");
    conversation = (await findConversation(ids[0]))!;
    const returning = {
      requestId: randomUUID(),
      conversationId: ids[0],
      version: conversation.version,
      operation: "return_to_ai" as const,
    };
    await transition(winner.actor, returning);
    await transition(winner.actor, returning);
    conversation = (await findConversation(ids[0]))!;
    assert.equal(conversationState(conversation), "AGENT_ACTIVE");
    assert.equal(conversation.agentId, null);
    assert.equal(conversation.aiMessageCount, 1);
    assert.ok(conversation.analystSummary?.includes("tomada diferente"));
    const held = await runs.begin(
      user,
      {
        requestId: randomUUID(),
        conversationId: ids[0],
        text: "Continuar após o analista.",
      },
      "test",
    );
    const child = await promisify(execFile)(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "tests/helpers/context-reader.ts",
        held._id,
        user.uid,
      ],
      { cwd: process.cwd(), timeout: 60000 },
    );
    assert.ok(child.stdout.includes("tomada diferente"));
    await runs.finish(held, "Contexto humano recuperado.", [], null);

    // Takeover while a run has already prepared a write: fence the run and proposal.
    const live = await runs.begin(
      user,
      {
        requestId: randomUUID(),
        conversationId: ids[1],
        text: "Preciso de acesso.",
        startConversation: true,
      },
      "test",
    );
    const pending = await service.prepareTicketChange(
      {
        operation: "create",
        data: {
          ...data,
          title: "Acesso ao sistema de projetos",
          category: "Acesso",
          type: "REQ",
          urgency: "normal",
        },
      },
      { conversationId: ids[1], runId: live._id },
    );
    const beforeTakeover = (await findConversation(ids[1]))!;
    await transition(analysts[0], {
      requestId: randomUUID(),
      conversationId: ids[1],
      version: beforeTakeover.version,
      operation: "assume",
    });
    assert.equal(
      (await db.collection<AgentRun>("agent_runs").findOne({ _id: live._id }))
        ?.state,
      "interrupted",
    );
    assert.equal(
      await runs.finish(live, "FORBIDDEN AFTER TAKEOVER", [], null),
      null,
    );
    const assigned = (await findConversation(ids[1]))!;
    await transition(analysts[0], {
      conversationId: ids[1],
      version: assigned.version,
      operation: "return_to_ai",
    });
    await assert.rejects(() => runs.assertActive(live));
    await assert.rejects(() =>
      service.confirmConversationDraft({
        conversationId: ids[1],
        draftId: pending.draftId,
        digest: pending.digest,
      }),
    );
    const previewAgent = createNexoAgent(
      scriptedModel([
        textParts("Uma prévia gerada antes da intervenção humana. ".repeat(3)),
      ]),
      tools,
    );
    new Mastra({ agents: { previewAgent }, logger: false });
    const previewInput = {
      requestId: randomUUID(),
      conversationId: ids[1],
      text: "Continue minha solicitação.",
    };
    const previewService = createAgentTurnService({
      repository: runs,
      authenticate: async () => user,
      configured: () => {},
      agent: async () => previewAgent,
    });
    const preview = await previewService(
      previewInput,
      new AbortController().signal,
    );
    assert.equal((await preview.next()).value?.type, "started");
    assert.equal((await preview.next()).value?.type, "delta");
    const direct = {
      customerId: user.uid,
      conversationId: ids[1],
      requestId: randomUUID(),
      reason: "requested",
      summary: "Funcionário solicita humano durante uma resposta em andamento.",
    };
    await assert.rejects(() =>
      transferToHuman({ ...direct, customerId: "foreign" }),
    );
    await transferToHuman(direct);
    await transferToHuman(direct);
    for await (const event of preview) assert.notEqual(event.type, "completed");
    assert.equal(
      await db
        .collection<Message>("messages")
        .countDocuments({
          conversationId: ids[1],
          runId: previewInput.requestId,
          role: "assistant",
        }),
      0,
    );
    const queued = (await findConversation(ids[1]))!;
    await transition(analysts[0], {
      conversationId: ids[1],
      version: queued.version,
      operation: "assume",
    });
    const directAssigned = (await findConversation(ids[1]))!;
    await transition(analysts[0], {
      conversationId: ids[1],
      version: directAssigned.version,
      operation: "return_to_ai",
    });
    await transferToHuman(direct); // replay after return is a receipt, never a new transfer
    assert.equal(
      conversationState((await findConversation(ids[1]))!),
      "AGENT_ACTIVE",
    );

    const criticalDraft = await service.prepareTicketChange({
      operation: "create",
      data: {
        ...data,
        title: "Rede inteira indisponível",
        category: "Rede e VPN",
        impact: "team",
      },
    });
    const critical = await service.confirmTicketChange({
      draftId: criticalDraft.draftId,
      digest: criticalDraft.digest,
      token: criticalDraft.token,
    });
    await start(
      ids[2],
      "Veja a situação da rede da equipe.",
      [
        [
          toolCall("getTicketStatus", {
            ticketId: critical._id,
            rationale: "Consultar prioridade e prazo reais.",
          }),
        ],
        textParts("FORBIDDEN"),
      ],
      true,
    );
    assert.equal((await findConversation(ids[2]))?.handoff?.reason, "critical");
    await db
      .collection<Ticket>("tickets")
      .updateOne(
        { _id: ticket._id },
        { $set: { nextResponseDueAt: new Date(0) } },
      );
    await start(
      ids[3],
      "Como está meu notebook?",
      [
        [
          toolCall("getTicketStatus", {
            ticketId: ticket._id,
            rationale: "Consultar prazo real.",
          }),
        ],
        textParts("FORBIDDEN"),
      ],
      true,
    );
    assert.equal((await findConversation(ids[3]))?.handoff?.reason, "overdue");
    await start(
      ids[4],
      "As informações de configuração são contraditórias.",
      [
        [
          toolCall("requestHumanHandoff", {
            reason: "uncertain",
            summary: "Informações insuficientes para decidir com segurança.",
            rationale: "Solicitar avaliação humana do caso.",
          }),
        ],
        textParts("FORBIDDEN"),
      ],
      true,
    );
    assert.equal(
      (await findConversation(ids[4]))?.handoff?.reason,
      "uncertain",
    );

    conversation = (await findConversation(ids[0]))!;
    await transition(winner.actor, {
      conversationId: ids[0],
      version: conversation.version,
      operation: "assume",
    });
    conversation = (await findConversation(ids[0]))!;
    const close = {
      requestId: randomUUID(),
      conversationId: ids[0],
      version: conversation.version,
      operation: "close" as const,
    };
    await transition(winner.actor, close);
    await transition(winner.actor, close);
    assert.equal(
      conversationState((await findConversation(ids[0]))!),
      "CLOSED",
    );
    assert.ok((await findConversation(ids[0]))?.closedAt);
    assert.equal((await service.getTicket(ticket._id)).status, "open");
    await assert.rejects(() =>
      send(user, ids[0], "Não pode enviar após encerrar."),
    );
    assert.equal(
      await db
        .collection<Message>("messages")
        .countDocuments({ conversationId: { $in: ids }, text: /FORBIDDEN/ }),
      0,
    );
    console.log(
      "Handoff database passed: all reasons, structured summary, atomic notice, strict AI pause, repeated handoff, competing analysts, human messages, idempotent return/close, separate-process context, draft fencing and takeover during an active run.",
    );
  } finally {
    const tickets = await db
      .collection<Ticket>("tickets")
      .find({ customerId: user.uid })
      .toArray();
    await db
      .collection("ticket_events")
      .deleteMany({ ticketId: { $in: tickets.map((ticket) => ticket._id) } });
    await db
      .collection<TicketDraft>("ticket_drafts")
      .deleteMany({ customerId: user.uid });
    await db.collection<Ticket>("tickets").deleteMany({ customerId: user.uid });
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
      .deleteMany({ _id: { $in: ids }, customerId: user.uid });
    await db.client.close();
  }
}
main().catch((error) => {
  if (error instanceof assert.AssertionError)
    console.error(error.message, error.stack);
  console.error(
    "Handoff database failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  process.exitCode = 1;
});
