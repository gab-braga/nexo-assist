import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Conversation, Message, SessionUser } from "../src/types/domain";
import type { AgentRun } from "../src/types/ai";
import type {
  Ticket,
  TicketData,
  TicketDraft,
  TicketEvent,
} from "../src/types/tickets";
import type { MessageCursor } from "../src/server/policies/message-history";
loadEnvConfig(process.cwd());

async function main() {
  const { database } = await import("../src/server/lib/mongodb");
  const { agentRunRepository: repository } =
    await import("../src/server/repositories/agent-runs");
  const { findMessages } =
    await import("../src/server/repositories/conversations");
  const { messageHistoryFilter } =
    await import("../src/server/policies/message-history");
  const { createAgentTurnService } =
    await import("../src/server/services/agent-turns");
  const { createNexoAgent } =
    await import("../src/server/ai/agents/nexo-agent");
  const { createNexoTools } = await import("../src/server/ai/tools");
  const { ticketService } = await import("../src/server/services/tickets");
  const { createTicketService } =
    await import("../src/server/services/tickets");
  const { ticketRepository } =
    await import("../src/server/repositories/tickets");
  const { scriptedModel, textParts, toolCall } =
    await import("./helpers/scripted-model");
  const { Mastra } = await import("@mastra/core/mastra");
  const db = await database();
  const user: SessionUser = {
    uid: `memory-test-${randomUUID()}`,
    name: "Memory test",
    email: "test@example.test",
    role: "chat",
  };
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const foreign = { ...user, uid: `${user.uid}-foreign` };
  const services = (actor: SessionUser) =>
    createTicketService({
      repository: ticketRepository,
      now: () => new Date(),
      available: () => {},
      authenticate: async () => actor,
    });
  const data: TicketData = {
    title: `Notebook ${user.uid}`,
    description: "Registro temporário para teste de contexto.",
    type: "INC",
    category: "Hardware",
    impact: "person",
    urgency: "today",
  };
  const messages = db.collection<Message>("messages");
  const conversations = db.collection<Conversation>("conversations");
  const runs = db.collection<AgentRun>("agent_runs");
  const first = {
    requestId: randomUUID(),
    conversationId: ids[0],
    text: "Meu notebook está muito lento.",
    startConversation: true as const,
  };
  try {
    const initial = await repository.begin(user, first, "test");
    await repository.finish(initial, "Quando começou?", [], null);
    // Fixtures force the initial issue outside the recent history window.
    const fixtures: Message[] = Array.from({ length: 24 }, (_, index) => ({
      _id: randomUUID(),
      conversationId: ids[0],
      authorId: "nexo-assist",
      authorName: "Nexo Assist",
      role: "assistant",
      text: `Contexto intermediário ${index}`,
      createdAt: new Date(),
      sequence: 10 + index,
    }));
    await messages.insertMany(fixtures);
    await conversations.updateOne({ _id: ids[0] }, { $set: { version: 40 } });
    let prompt = "";
    const agent = createNexoAgent(
      scriptedModel(
        [textParts("Entendi a relação com a atualização.")],
        (options) => {
          prompt = JSON.stringify(options.prompt);
        },
      ),
      createNexoTools({ tickets: ticketService, knowledge: async () => [] }),
    );
    new Mastra({ agents: { agent }, logger: false });
    const start = createAgentTurnService({
      repository,
      authenticate: async () => user,
      configured: () => {},
      agent: async () => agent,
    });
    const second = {
      requestId: randomUUID(),
      conversationId: ids[0],
      text: "Isso começou depois da atualização do Windows.",
    };
    for await (const event of await start(
      second,
      new AbortController().signal,
    )) {
      if (event.type === "error") assert.fail(event.code);
    }
    assert.ok(prompt.includes(first.text));
    assert.ok(prompt.includes(second.text));
    assert.equal(
      (await conversations.findOne({ _id: ids[0] }))?.aiMessageCount,
      2,
    );
    assert.equal(await messages.countDocuments({ _id: second.requestId }), 1);

    const held = await repository.begin(
      user,
      {
        requestId: randomUUID(),
        conversationId: ids[0],
        text: "Ainda preciso de ajuda.",
      },
      "test",
    );
    const ownDraft = await services(user).prepareTicketChange({
      operation: "create",
      data,
    });
    const foreignDraft = await services(foreign).prepareTicketChange({
      operation: "create",
      data,
    });
    await assert.rejects(() =>
      repository.remember(held, { pendingDraftId: foreignDraft.draftId }),
    );
    await repository.remember(held, { pendingDraftId: ownDraft.draftId });
    const pending = await repository.loadContext(held);
    assert.equal(pending.pendingOperation?.state, "pending");
    assert.ok(!JSON.stringify(pending).includes(ownDraft.token));
    assert.ok(!JSON.stringify(pending).includes(ownDraft.digest));
    await db
      .collection<TicketDraft>("ticket_drafts")
      .updateOne(
        { _id: ownDraft.draftId },
        { $set: { expiresAt: new Date(0) } },
      );
    assert.equal(
      (await repository.loadContext(held)).pendingOperation?.state,
      "expired",
    );
    await db
      .collection<TicketDraft>("ticket_drafts")
      .updateOne(
        { _id: ownDraft.draftId },
        { $set: { expiresAt: new Date(Date.now() + 60000) } },
      );
    const ticket = await services(user).confirmTicketChange({
      draftId: ownDraft.draftId,
      token: ownDraft.token,
      digest: ownDraft.digest,
    });
    await repository.remember(held, { selectedTicketId: ticket._id });
    assert.equal(
      (await repository.loadContext(held)).pendingOperation?.state,
      "applied",
    );
    assert.equal(
      (await repository.loadContext(held)).selectedTicket?.id,
      ticket._id,
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
    const recovered = JSON.parse(child.stdout.trim());
    assert.equal(recovered.initialId, first.requestId);
    assert.ok(JSON.stringify(recovered.context).includes(first.text));
    assert.ok(JSON.stringify(recovered.context).includes(second.text));
    await assert.rejects(() =>
      repository.loadContext({ ...held, customerId: "foreign" }),
    );
    await assert.rejects(() =>
      repository.remember(held, { selectedTicketId: randomUUID() }),
    );
    await repository.finish(held, null, [], null, "RUN_INTERRUPTED");

    // A draft prepared before a lost stream is retained; replay must not prepare it again.
    const controller = new AbortController();
    const toolAgent = createNexoAgent(
      scriptedModel([
        [
          toolCall("prepareTicketDraft", {
            change: {
              operation: "create",
              data: { ...data, title: "Teclado com teclas travadas" },
            },
            rationale: "Dados suficientes para preparar rascunho.",
          }),
        ],
        textParts("Rascunho preparado."),
      ]),
      createNexoTools({ tickets: services(user), knowledge: async () => [] }),
    );
    new Mastra({ agents: { toolAgent }, logger: false });
    const abortingRepository = {
      ...repository,
      remember: async (
        run: AgentRun,
        patch: Parameters<typeof repository.remember>[1],
      ) => {
        await repository.remember(run, patch);
        controller.abort();
      },
    };
    const toolInput = {
      requestId: randomUUID(),
      conversationId: ids[2],
      text: "Prepare o chamado do teclado.",
      startConversation: true as const,
    };
    let toolCalls = 0;
    const interruptedService = createAgentTurnService({
      repository: abortingRepository,
      authenticate: async () => user,
      configured: () => {},
      agent: async () => {
        toolCalls++;
        return toolAgent;
      },
    });
    for await (const event of await interruptedService(
      toolInput,
      controller.signal,
    ))
      assert.notEqual(event.type, "completed");
    const afterTool = await conversations.findOne({ _id: ids[2] });
    assert.ok(afterTool?.pendingDraftId);
    assert.equal(
      (await runs.findOne({ _id: toolInput.requestId }))?.state,
      "interrupted",
    );
    const draftsBeforeReplay = await db
      .collection<TicketDraft>("ticket_drafts")
      .countDocuments({ customerId: user.uid });
    for await (const event of await interruptedService(
      toolInput,
      new AbortController().signal,
    ))
      assert.notEqual(event.type, "completed");
    assert.equal(toolCalls, 1);
    assert.equal(
      await db
        .collection<TicketDraft>("ticket_drafts")
        .countDocuments({ customerId: user.uid }),
      draftsBeforeReplay,
    );
    assert.equal(await messages.countDocuments({ conversationId: ids[2] }), 1);

    const interruptedInput = {
      requestId: randomUUID(),
      conversationId: ids[1],
      text: "VPN parou",
      startConversation: true as const,
    };
    const interrupted = await repository.begin(user, interruptedInput, "test");
    await runs.updateOne(
      { _id: interrupted._id },
      { $set: { expiresAt: new Date(0) } },
    );
    await assert.rejects(() => repository.recover(ids[1], "foreign"));
    assert.equal(await repository.recover(ids[1], user.uid), true);
    assert.equal(await repository.recover(ids[1], user.uid), false);
    const replay = await repository.begin(user, interruptedInput, "test");
    assert.equal(replay.state, "interrupted");
    assert.equal(
      (await messages.findOne({ _id: interrupted._id }))?.processingState,
      "interrupted",
    );
    assert.equal(
      (await conversations.findOne({ _id: ids[1] }))?.aiMessageCount,
      1,
    );
    assert.equal(
      (await conversations.findOne({ _id: ids[1] }))?.aiActiveRunId,
      null,
    );
    let calls = 0;
    const noReplay = createAgentTurnService({
      repository,
      authenticate: async () => user,
      configured: () => {},
      agent: async () => {
        calls++;
        return agent;
      },
    });
    for await (const event of await noReplay(
      interruptedInput,
      new AbortController().signal,
    ))
      assert.notEqual(event.type, "delta");
    assert.equal(calls, 0);

    // Exercise pagination across sequenced and legacy messages with identical timestamps.
    const legacy: Message[] = Array.from({ length: 3 }, () => ({
      _id: randomUUID(),
      conversationId: ids[0],
      authorId: user.uid,
      authorName: user.name,
      role: "chat",
      text: "Legacy",
      createdAt: new Date(0),
    }));
    await messages.insertMany(legacy);
    const expected = await messages
      .find({ conversationId: ids[0] })
      .sort({ sequence: -1, createdAt: -1, _id: -1 })
      .toArray();
    const seen: string[] = [];
    let cursor: MessageCursor | undefined;
    for (;;) {
      const page = await findMessages(messageHistoryFilter(ids[0], cursor), 7);
      if (!page.length) break;
      seen.push(...page.map((message) => message._id));
      const last = page.at(-1)!;
      cursor = {
        date: last.createdAt.toISOString(),
        id: last._id,
        ...(last.sequence !== undefined ? { sequence: last.sequence } : {}),
      };
    }
    assert.deepEqual(
      seen,
      expected.map((message) => message._id),
    );
    assert.equal(new Set(seen).size, seen.length);
    console.log(
      "Memory database integration passed: real Mastra context, separate-process recovery, ownership, expired leases, replay safety, counter and mixed-history pagination.",
    );
  } finally {
    const owners = [user.uid, foreign.uid];
    const tickets = await db
      .collection<Ticket>("tickets")
      .find({ customerId: { $in: owners } })
      .toArray();
    await db
      .collection<TicketEvent>("ticket_events")
      .deleteMany({ ticketId: { $in: tickets.map((ticket) => ticket._id) } });
    await db
      .collection<TicketDraft>("ticket_drafts")
      .deleteMany({ customerId: { $in: owners } });
    await db
      .collection<Ticket>("tickets")
      .deleteMany({ customerId: { $in: owners } });
    await db
      .collection<{ _id: string }>("ticket_customer_locks")
      .deleteMany({ _id: { $in: owners } });
    await runs.deleteMany({ customerId: user.uid });
    await messages.deleteMany({ conversationId: { $in: ids } });
    await conversations.deleteMany({ _id: { $in: ids }, customerId: user.uid });
    await db.client.close();
  }
}
main().catch((error) => {
  if (error instanceof assert.AssertionError)
    console.error(error.message, error.stack);
  console.error(
    "Memory database integration failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  process.exitCode = 1;
});
