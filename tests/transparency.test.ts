import { test } from "node:test";
import assert from "node:assert/strict";
import { RequestContext } from "@mastra/core/request-context";
import { NexoRunContext, runTool, toolScope } from "../src/server/ai/context";
import { actionStream } from "../src/server/ai/action-stream";
import {
  actionFacts,
  auditToAction,
  mergeAudit,
  priorityExplanation,
  safeAuditParameters,
} from "../src/server/policies/agent-actions";
import { AgentActionSchema } from "../src/lib/schemas/agent-actions";
import { AppError } from "../src/server/lib/errors";
import type { AgentAudit, AgentRun } from "../src/types/ai";

const user = {
  uid: "employee",
  name: "Ana",
  email: "test@example.test",
  role: "chat" as const,
};
const run = {
  _id: "run",
  conversationId: "conversation",
  responseId: "response",
  state: "running",
} satisfies Pick<AgentRun, "_id" | "conversationId" | "responseId" | "state">;
const entry = (patch: Partial<AgentAudit> = {}): AgentAudit => ({
  id: "event",
  sequence: 1,
  kind: "tool_result",
  tool: "evaluateTicketPriority",
  intent: "create",
  rationale: "SECRET MODEL THOUGHT",
  parameters: { impact: "person", urgency: "blocked" },
  outcome: "success",
  state: "succeeded",
  facts: { priority: "high" },
  at: new Date().toISOString(),
  evidenceIds: [],
  ...patch,
});
function scope(
  persist: (event: AgentAudit) => Promise<AgentAudit> = async (event) => event,
) {
  return new NexoRunContext(
    user.uid,
    run.conversationId,
    run._id,
    new AbortController().signal,
    async () => user,
    async () => {},
    async () => {},
    async () => {},
    { responseId: run.responseId, persist },
  );
}

test("functional explanations use verified priority inputs, not model rationale or secret parameters", () => {
  const action = auditToAction(
    run,
    entry({
      parameters: {
        impact: "person",
        urgency: "blocked",
        token: "SECRET",
        prompt: "SECRET",
      },
    }),
    0,
  );
  assert.equal(action.source, "rule");
  assert.match(action.summary, /impedimento/);
  assert.ok(!JSON.stringify(action).includes("SECRET"));
  assert.match(priorityExplanation("high", "person", "today"), /mesmo dia/);
  assert.match(priorityExplanation("critical", "team", "blocked"), /equipe/);
  assert.match(priorityExplanation("high"), /não há dados/);
  assert.match(priorityExplanation("high", "team", "blocked"), /não permitem/);
  assert.deepEqual(
    safeAuditParameters({ impact: "forged", token: "SECRET", queryLength: 50 }),
    { queryLength: 50 },
  );
});
test("knowledge and duplicate explanations distinguish missing context and actual found candidates", () => {
  const facts = actionFacts("searchKnowledgeBase", [
    {
      _id: "article",
      title: "VPN",
      applicable: false,
      requiresEnvironment: true,
      content: "SECRET ARTICLE BODY",
    },
  ]);
  const action = auditToAction(
    run,
    entry({ tool: "searchKnowledgeBase", facts }),
    0,
  );
  assert.match(action.summary, /sistema e a versão/);
  assert.ok(!JSON.stringify(action).includes("SECRET"));
  const duplicates = actionFacts("findDuplicateTickets", {
    items: [
      {
        _id: "ticket",
        title: "Notebook",
        number: "INC-1",
        customerId: "SECRET",
      },
    ],
  });
  assert.match(
    auditToAction(
      run,
      entry({ tool: "findDuplicateTickets", facts: duplicates }),
      0,
    ).summary,
    /seleção/,
  );
  assert.match(
    auditToAction(
      run,
      entry({
        tool: "prepareTicketDraft",
        outcome: "failure",
        state: "failed",
        code: "DUPLICATE_TICKET",
      }),
      0,
    ).summary,
    /bloqueou/,
  );
});
test("tool evidence is projected by whitelist and cannot contain credentials, confirmation tokens or raw objects", () => {
  const facts = actionFacts("prepareTicketDraft", {
    draftId: "draft",
    confirmationRequired: true,
    executed: false,
    operation: "create",
    token: "SECRET",
    digest: "SECRET",
    priority: "high",
    data: { impact: "person", urgency: "blocked", description: "SECRET" },
  });
  const action = auditToAction(
    run,
    entry({ tool: "prepareTicketDraft", facts }),
    0,
  );
  assert.ok(AgentActionSchema.safeParse(action).success);
  assert.ok(!JSON.stringify(facts).includes("SECRET"));
  assert.match(action.summary, /ainda não/);
  assert.match(
    auditToAction(
      run,
      entry({ facts: undefined, tool: "getTicketStatus" }),
      0,
    ).details.at(-1)!.value,
    /não contém detalhes/,
  );
});
test("one canonical event transitions from running to terminal without duplicate or terminal regression", () => {
  const running = entry({ state: "running", outcome: "failure" });
  const completed = entry({ durationMs: 15 });
  assert.equal(mergeAudit([running], [completed, completed]).length, 1);
  assert.equal(mergeAudit([completed], [running])[0].state, "succeeded");
  assert.equal(
    auditToAction({ ...run, state: "interrupted" }, running, 0).state,
    "unknown",
  );
});
test("action stream emits real started state while a provider/tool result is still pending", async () => {
  const saved: AgentAudit[] = [];
  const context = scope(async (event) => {
    saved.push(structuredClone(event));
    return event;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const operation = runTool(
    context,
    "evaluateTicketPriority",
    "create",
    "SECRET",
    { impact: "person", urgency: "blocked" },
    async () => {
      await gate;
      return { priority: "high" };
    },
  );
  async function* provider() {
    await operation;
    yield "response";
  }
  const stream = actionStream(provider(), context);
  const first = await stream.next();
  assert.equal(first.value?.kind, "action");
  if (first.value?.kind === "action")
    assert.equal(first.value.action.state, "running");
  assert.equal(saved[0].state, "running");
  assert.ok(!JSON.stringify(saved).includes("SECRET"));
  release();
  const events = [];
  for await (const event of stream) events.push(event);
  assert.ok(
    events.some(
      (event) => event.kind === "action" && event.action.state === "succeeded",
    ),
  );
  assert.equal(saved.at(-1)?.id, saved[0].id);
  assert.equal(context.audit.length, 1);
});
test("failed start persistence prevents tool work; failed end persistence leaves an unknown outcome", async () => {
  let work = 0;
  const unavailable = () => {
    throw new AppError("PERSISTENCE_UNAVAILABLE", "SECRET connection");
  };
  const a = scope(async () => unavailable());
  await runTool(
    a,
    "prepareTicketDraft",
    "create",
    "rationale",
    {},
    async () => {
      work++;
      return {};
    },
  );
  assert.equal(work, 0);
  assert.equal(a.audit[0].state, "not_started");
  const b = scope(async (event) =>
    event.state === "running" ? event : unavailable(),
  );
  await runTool(
    b,
    "prepareTicketDraft",
    "create",
    "rationale",
    {},
    async () => {
      work++;
      return { draftId: "draft" };
    },
  );
  assert.equal(work, 1);
  assert.equal(b.audit[0].state, "unknown");
});
test("Mastra native log/correlation integration sends identifiers and durations, never input or output bodies", async () => {
  const context = scope();
  const requestContext = new RequestContext();
  requestContext.set("nexo", context);
  const logs: unknown[] = [];
  await runTool(
    toolScope({
      requestContext,
      agent: { toolCallId: "native-call" },
      tracingContext: {
        currentSpan: {
          isValid: true,
          traceId: "a".repeat(32),
          id: "b".repeat(16),
        },
      },
      observe: { log: (...args: unknown[]) => logs.push(args) },
    }),
    "recordDecision",
    "clarify",
    "SECRET MODEL DATA",
    {},
    async () => ({ recorded: true, token: "SECRET OUTPUT" }),
  );
  assert.equal(context.audit[0].native?.toolCallId, "native-call");
  assert.equal(context.audit[0].native?.traceId, "a".repeat(32));
  assert.equal(logs.length, 2);
  assert.ok(!JSON.stringify(logs).includes("SECRET"));
});
