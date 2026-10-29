import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Conversation, Message, SessionUser } from "../src/types/domain";
import type { AgentRun } from "../src/types/ai";
loadEnvConfig(process.cwd());

async function main() {
  const { database } = await import("../src/server/lib/mongodb");
  const { agentRunRepository: repository } =
    await import("../src/server/repositories/agent-runs");
  const { createConversationRecord, findConversation, transitionRecord } =
    await import("../src/server/repositories/conversations");
  const { createAgentTurnService } =
    await import("../src/server/services/agent-turns");
  const { createNexoAgent } =
    await import("../src/server/ai/agents/nexo-agent");
  const { createNexoTools } = await import("../src/server/ai/tools");
  const { ticketService } = await import("../src/server/services/tickets");
  const { scriptedModel, textParts, toolCall } =
    await import("./helpers/scripted-model");
  const { Mastra } = await import("@mastra/core/mastra");
  const { AppError } = await import("../src/server/lib/errors");
  const { conversationTitle } = await import("../src/lib/conversation-title");
  const db = await database();
  const namespace = `agent-test-${randomUUID()}`;
  const user: SessionUser = {
    uid: namespace,
    name: "Temporary AI test",
    email: "test@example.test",
    role: "chat",
  };
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const conversations = db.collection<Conversation>("conversations");
  try {
    for (const _id of ids.slice(1, 3))
      await createConversationRecord({
        _id,
        customerId: user.uid,
        customerName: user.name,
        subject: "Temporary AI integration test",
        status: "waiting",
        agentId: null,
        agentName: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 0,
        aiEnabled: true,
      });
    const tools = createNexoTools({
      tickets: ticketService,
      knowledge: async () => [],
    });
    const agent = createNexoAgent(
      scriptedModel([
        [
          toolCall("recordDecision", {
            intent: "clarify",
            rationale: "É necessário saber qual erro de VPN aparece.",
          }),
        ],
        textParts("Qual erro aparece ao conectar à VPN?"),
      ]),
      tools,
    );
    new Mastra({ agents: { agent }, logger: false });
    let invocations = 0;
    const start = createAgentTurnService({
      repository,
      authenticate: async () => user,
      configured: () => {},
      agent: async () => {
        invocations++;
        return agent;
      },
    });
    const input = {
      requestId: randomUUID(),
      conversationId: ids[0],
      text: "VPN não conecta",
      startConversation: true as const,
    };
    assert.equal(await findConversation(ids[0]), null);
    await assert.rejects(() =>
      start({ ...input, text: " \n " }, new AbortController().signal),
    );
    assert.equal(await findConversation(ids[0]), null);
    const attemptsToStart = await Promise.allSettled([
      start(input, new AbortController().signal),
      start(input, new AbortController().signal),
    ]);
    assert.equal(
      attemptsToStart.filter((attempt) => attempt.status === "fulfilled")
        .length,
      1,
    );
    const winner = attemptsToStart.find(
      (attempt) => attempt.status === "fulfilled",
    );
    assert.ok(winner?.status === "fulfilled");
    const result = [];
    for await (const event of winner.value) result.push(event);
    assert.equal(result.at(-1)?.type, "completed");
    const saved = await db
      .collection<AgentRun>("agent_runs")
      .findOne({ _id: input.requestId });
    assert.equal(saved?.state, "completed");
    assert.equal(saved?.audit[0]?.intent, "clarify");
    assert.ok(saved?.usage?.inputTokens);
    assert.equal(
      await db
        .collection<Message>("messages")
        .countDocuments({ conversationId: ids[0] }),
      2,
    );
    for await (const event of await start(input, new AbortController().signal))
      assert.notEqual(event.type, "delta");
    assert.equal((await findConversation(ids[0]))?.aiMessageCount, 1);
    assert.equal(
      (await findConversation(ids[0]))?.subject,
      conversationTitle(input.text),
    );
    assert.equal(invocations, 1);
    assert.equal(
      await db
        .collection<Message>("messages")
        .countDocuments({ _id: input.requestId, conversationId: ids[0] }),
      1,
    );
    assert.equal(
      await db
        .collection<Message>("messages")
        .countDocuments({ conversationId: ids[0] }),
      2,
    );
    await assert.rejects(() =>
      repository.begin(user, { ...input, requestId: randomUUID() }, "test"),
    );
    // A request ID collision rolls back the attempted new conversation as well.
    await assert.rejects(() =>
      start({ ...input, conversationId: ids[3] }, new AbortController().signal),
    );
    assert.equal(await findConversation(ids[3]), null);
    assert.equal(
      await db
        .collection<AgentRun>("agent_runs")
        .countDocuments({ conversationId: ids[3] }),
      0,
    );
    await assert.rejects(
      () => repository.begin({ ...user, uid: "other" }, input, "test"),
      (error: unknown) =>
        error instanceof AppError && error.code === "NOT_FOUND",
    );
    await assert.rejects(
      () =>
        repository.begin(user, { ...input, text: "different payload" }, "test"),
      (error: unknown) =>
        error instanceof AppError && error.code === "CONFLICT",
    );

    // Counter increment and active-run acquisition must be atomic across requests.
    await conversations.updateOne(
      { _id: ids[1] },
      { $set: { aiMessageCount: 29 } },
    );
    const attempts = await Promise.allSettled(
      [1, 2].map(() =>
        repository.begin(
          user,
          { requestId: randomUUID(), conversationId: ids[1], text: "Ajuda" },
          "test",
        ),
      ),
    );
    assert.equal(
      attempts.filter((attempt) => attempt.status === "fulfilled").length,
      1,
    );
    assert.equal((await findConversation(ids[1]))?.aiMessageCount, 30);
    const live = attempts.find((attempt) => attempt.status === "fulfilled");
    assert.ok(live?.status === "fulfilled");
    const run = live.value;
    const before = (await findConversation(ids[1]))!;
    await transitionRecord(
      {
        _id: ids[1],
        version: before.version,
        status: "waiting",
        agentId: null,
      },
      {
        status: "active",
        agentId: "temporary-analyst",
        agentName: "Test",
        updatedAt: new Date(),
      },
      {
        _id: randomUUID(),
        conversationId: ids[1],
        actorId: "temporary-analyst",
        operation: "assume",
        createdAt: new Date(),
      },
    );
    await assert.rejects(() => repository.assertActive(run));
    const active = (await findConversation(ids[1]))!;
    await transitionRecord(
      { _id: ids[1], version: active.version, agentId: "temporary-analyst" },
      {
        status: "waiting",
        agentId: null,
        agentName: null,
        updatedAt: new Date(),
      },
      {
        _id: randomUUID(),
        conversationId: ids[1],
        actorId: "temporary-analyst",
        operation: "release",
        createdAt: new Date(),
      },
    );
    await assert.rejects(() => repository.assertActive(run)); // fences even after assume/release
    assert.equal(
      await repository.finish(run, "MUST NOT BE PUBLISHED", [], null),
      null,
    );
    await assert.rejects(
      () =>
        repository.begin(
          user,
          {
            requestId: randomUUID(),
            conversationId: ids[1],
            text: "Mensagem 31",
          },
          "test",
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "MESSAGE_LIMIT",
    );

    const handoff = await repository.begin(
      user,
      {
        requestId: randomUUID(),
        conversationId: ids[2],
        text: "Quero falar com analista",
      },
      "test",
    );
    await repository.handoff(
      handoff,
      "requested",
      "Funcionário solicita atendimento humano.",
    );
    assert.equal((await findConversation(ids[2]))?.aiHandoff, true);
    await repository.finish(
      handoff,
      "Conversa encaminhada à fila humana.",
      [],
      null,
    );
    await assert.rejects(
      () =>
        repository.begin(
          user,
          {
            requestId: randomUUID(),
            conversationId: ids[2],
            text: "Ainda está aí?",
          },
          "test",
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "HUMAN_CONTROL",
    );
    console.log(
      "Agent database integration passed: atomic first-message creation, automatic title, concurrent/replayed sends invoke the agent once, rollback, history, ownership, counter and human control.",
    );
  } finally {
    await db
      .collection<AgentRun>("agent_runs")
      .deleteMany({ customerId: namespace, conversationId: { $in: ids } });
    await db
      .collection<Message>("messages")
      .deleteMany({ conversationId: { $in: ids } });
    await db
      .collection("conversation_events")
      .deleteMany({ conversationId: { $in: ids } });
    await conversations.deleteMany({
      _id: { $in: ids },
      customerId: namespace,
    });
    await db.client.close();
  }
}
main().catch((error) => {
  if (error instanceof assert.AssertionError)
    console.error(error.message, error.stack);
  console.error(
    "Agent database integration failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  process.exitCode = 1;
});
