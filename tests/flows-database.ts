import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Conversation, Message, SessionUser } from "../src/types/domain";
import type { Ticket, TicketDraft } from "../src/types/tickets";
import type { AgentRun } from "../src/types/ai";
loadEnvConfig(process.cwd());

async function main() {
  const { database } = await import("../src/server/lib/mongodb");
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
  const user: SessionUser = {
    uid: `flow-test-${randomUUID()}`,
    name: "Teste de fluxos",
    email: "test@example.test",
    role: "chat",
  };
  const conversationId = randomUUID();
  const tickets = createTicketService({
    repository: ticketRepository,
    authenticate: async () => user,
    available: () => {},
    now: () => new Date(),
  });
  const tools = createNexoTools({ tickets, knowledge: async () => [] });
  const data = {
    title: `Notebook ${user.uid}`,
    description: "Notebook não liga desde a manhã e não há alternativa.",
    type: "INC",
    category: "Hardware",
    impact: "person",
    urgency: "blocked",
  };
  let turns = 0;
  async function turn(
    text: string,
    steps: Parameters<typeof scriptedModel>[0],
  ) {
    const agent = createNexoAgent(scriptedModel(steps), tools);
    new Mastra({ agents: { agent }, logger: false });
    const start = createAgentTurnService({
      repository: agentRunRepository,
      authenticate: async () => user,
      configured: () => {},
      agent: async () => agent,
    });
    const events = [];
    for await (const event of await start(
      {
        requestId: randomUUID(),
        conversationId,
        text,
        ...(turns++ === 0 ? { startConversation: true } : {}),
      },
      new AbortController().signal,
    ))
      events.push(event);
    assert.equal(events.at(-1)?.type, "completed");
  }
  const draftInput = (draft: { draftId: string; digest: string }) => ({
    conversationId,
    draftId: draft.draftId,
    digest: draft.digest,
  });
  try {
    await turn("Meu notebook não liga e só eu estou impedido de trabalhar.", [
      [
        toolCall("findDuplicateTickets", {
          data,
          rationale: "Verificar duplicidade antes da proposta.",
        }),
      ],
      [
        toolCall("prepareTicketDraft", {
          change: { operation: "create", data },
          rationale: "Dados completos para revisão.",
        }),
      ],
      textParts("Revise o rascunho."),
    ]);
    const panel = await tickets.getConversationInteraction(conversationId);
    assert.equal(panel.draft?.state, "pending");
    assert.equal(panel.canConfirm, true);
    assert.equal(
      await db
        .collection<Ticket>("tickets")
        .countDocuments({ customerId: user.uid }),
      0,
    );
    const input = draftInput(panel.draft!);

    // Result message failure must roll back ticket, receipt, audit and draft together.
    const failing = createTicketService({
      repository: {
        ...ticketRepository,
        transaction: (work) =>
          ticketRepository.transaction((tx) =>
            work({
              ...tx,
              insertMessage: async () => {
                throw new Error("Injected message persistence failure");
              },
            }),
          ),
      },
      authenticate: async () => user,
      available: () => {},
      now: () => new Date(),
    });
    await assert.rejects(() => failing.confirmConversationDraft(input));
    assert.equal(
      await db
        .collection<Ticket>("tickets")
        .countDocuments({ customerId: user.uid }),
      0,
    );
    assert.equal(
      (await tickets.getConversationInteraction(conversationId)).draft?.state,
      "pending",
    );
    const concurrent = await Promise.allSettled([
      tickets.confirmConversationDraft(input),
      tickets.confirmConversationDraft(input),
    ]);
    assert.ok(concurrent.some((result) => result.status === "fulfilled"));
    const created = await tickets.confirmConversationDraft(input);
    assert.equal(created.priority, "high");
    assert.equal(
      await db
        .collection<Ticket>("tickets")
        .countDocuments({ customerId: user.uid }),
      1,
    );
    assert.equal(
      await db
        .collection<Message>("messages")
        .countDocuments({ conversationId, "ticket._id": created._id }),
      1,
    );
    assert.equal(
      await db
        .collection("conversation_events")
        .countDocuments({ conversationId, operation: "ticket_confirmed" }),
      1,
    );

    await turn("Descobri que o problema ocorre apenas com a VPN.", [
      [
        toolCall("getTicketDetails", {
          ticketId: created._id,
          rationale: "Consultar chamado selecionado.",
        }),
      ],
      [
        toolCall("prepareTicketDraft", {
          change: {
            operation: "update",
            ticketId: created._id,
            version: created.version,
            data: {
              ...data,
              description: "O problema ocorre apenas com a VPN.",
            },
          },
          rationale: "Acrescentar informação sem descartar histórico.",
        }),
      ],
      textParts("Revise a atualização."),
    ]);
    const update = (await tickets.getConversationInteraction(conversationId))
      .draft!;
    assert.ok(update.data.description.startsWith(data.description));
    const updated = await tickets.confirmConversationDraft(draftInput(update));
    assert.equal(updated.nextResponseDueAt, created.nextResponseDueAt);
    assert.equal((await tickets.getTicketHistory(created._id)).length, 2);

    await turn("Quero solicitar um monitor sem urgência.", [
      [
        toolCall("prepareTicketDraft", {
          change: {
            operation: "create",
            data: {
              ...data,
              title: `Monitor ${user.uid}`,
              type: "REQ",
              urgency: "normal",
            },
          },
          rationale: "Nova requisição independente.",
        }),
      ],
      textParts("Revise o pedido."),
    ]);
    const old = (await tickets.getConversationInteraction(conversationId))
      .draft!;
    await turn("Na verdade preciso de dois monitores.", [
      [
        toolCall("updateConversationFlow", {
          state: {
            intent: "create",
            stage: "collecting",
            data: {
              title: "Dois monitores",
              type: "REQ",
              category: "Hardware",
              impact: "person",
              urgency: "normal",
            },
            question: "Qual o motivo do pedido?",
          },
          rationale: "Revisar os dados antes de nova proposta.",
        }),
      ],
      textParts("Qual o motivo do pedido?"),
    ]);
    await assert.rejects(() =>
      tickets.confirmConversationDraft(draftInput(old)),
    );
    assert.equal(
      (await tickets.getConversationInteraction(conversationId)).draft?.state,
      "cancelled",
    );
    const fresh = createTicketService({
      repository: ticketRepository,
      authenticate: async () => user,
      available: () => {},
      now: () => new Date(),
    });
    assert.equal(
      (await fresh.getConversationInteraction(conversationId)).flow?.data
        ?.title,
      "Dois monitores",
    );
    const continuing = await agentRunRepository.begin(
      user,
      {
        requestId: randomUUID(),
        conversationId,
        text: "São duas telas para trabalhar.",
      },
      "test",
    );
    await agentRunRepository.remember(continuing, {
      flow: {
        intent: "create",
        stage: "collecting",
        data: { description: "Duas telas para trabalhar diariamente." },
      },
    });
    const resumed = await agentRunRepository.loadContext(continuing);
    assert.equal(resumed.flow?.data?.title, "Dois monitores");
    assert.equal(
      resumed.flow?.data?.description,
      "Duas telas para trabalhar diariamente.",
    );
    await agentRunRepository.finish(
      continuing,
      "Dados preservados para a proposta.",
      [],
      null,
    );

    await turn("Para trabalhar com duas telas.", [
      [
        toolCall("prepareTicketDraft", {
          change: {
            operation: "create",
            data: {
              ...data,
              title: `Dois monitores ${user.uid}`,
              type: "REQ",
              urgency: "normal",
              description: "Preciso de duas telas para o trabalho diário.",
            },
          },
          rationale: "Preparar pedido corrigido.",
        }),
      ],
      textParts("Revise o novo rascunho."),
    ]);
    const revised = (await tickets.getConversationInteraction(conversationId))
      .draft!;
    await fresh.cancelConversationDraft(draftInput(revised));
    await assert.rejects(() =>
      fresh.confirmConversationDraft(draftInput(revised)),
    );
    assert.equal(
      await db
        .collection<Ticket>("tickets")
        .countDocuments({ customerId: user.uid }),
      1,
    );

    const foreign = createTicketService({
      repository: ticketRepository,
      authenticate: async () => ({ ...user, uid: `${user.uid}-foreign` }),
      available: () => {},
      now: () => new Date(),
    });
    await assert.rejects(() =>
      foreign.getConversationInteraction(conversationId),
    );
    await assert.rejects(() => foreign.confirmConversationDraft(input));
    console.log(
      "Flow database integration passed: Mastra preparation, atomic rollback, concurrent confirmation/replay, persisted result, update preservation, new-turn invalidation, resumed state, cancellation and owner isolation.",
    );
  } finally {
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
    await db.collection<Message>("messages").deleteMany({ conversationId });
    await db.collection("conversation_events").deleteMany({ conversationId });
    await db
      .collection<Conversation>("conversations")
      .deleteMany({ _id: conversationId, customerId: user.uid });
    await db.client.close();
  }
}
main().catch((error) => {
  if (error instanceof assert.AssertionError)
    console.error(error.message, error.stack);
  console.error(
    "Flow database integration failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  process.exitCode = 1;
});
