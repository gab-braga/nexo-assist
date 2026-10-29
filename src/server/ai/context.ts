import "server-only";
import { ZodError } from "zod";
import { AppError } from "@/server/lib/errors";
import type {
  SessionUser,
  Result,
  ConversationContextPatch,
} from "@/types/domain";
import type { AgentAudit, AgentIntent } from "@/types/ai";
import { randomUUID } from "node:crypto";
import {
  actionFacts,
  auditToAction,
  operationalRationale,
  safeAuditParameters,
} from "@/server/policies/agent-actions";
import type { AgentAction } from "@/lib/schemas/agent-actions";

export class NexoRunContext {
  calls = 0;
  handoffRequested = false;
  draftSummary: string | null = null;
  handoffMessage: import("@/types/domain").Message | null = null;
  readonly audit: AgentAudit[] = [];
  readonly pendingActions: AgentAction[] = [];
  private wake: (() => void) | null = null;
  private notification: Promise<void> | null = null;
  private pendingTools = new Set<Promise<void>>();
  constructor(
    readonly userId: string,
    readonly conversationId: string,
    readonly runId: string,
    readonly signal: AbortSignal,
    readonly authenticate: () => Promise<SessionUser>,
    readonly assertActive: () => Promise<void>,
    readonly requestHandoff: (
      reason: string,
      summary: string,
    ) => Promise<import("@/types/domain").Message | void>,
    readonly rememberContext: (
      patch: ConversationContextPatch,
    ) => Promise<void>,
    readonly observability?: {
      responseId: string;
      persist: (event: AgentAudit) => Promise<AgentAudit>;
    },
  ) {}
  track() {
    let resolve!: () => void;
    const pending = new Promise<void>((done) => {
      resolve = done;
    });
    this.pendingTools.add(pending);
    return () => {
      this.pendingTools.delete(pending);
      resolve();
    };
  }
  async settle() {
    await Promise.all([...this.pendingTools]);
  }
  waitForAction() {
    if (this.pendingActions.length) return Promise.resolve();
    return (this.notification ??= new Promise<void>((resolve) => {
      this.wake = resolve;
    }));
  }
  async record(event: AgentAudit, persist = true) {
    const saved =
      persist && this.observability
        ? await this.observability.persist(event)
        : event;
    const index = this.audit.findIndex((entry) => entry.id === event.id);
    if (index < 0 && this.audit.length >= 24) return;
    if (index < 0) this.audit.push(saved);
    else this.audit[index] = saved;
    this.pendingActions.push(
      auditToAction(
        {
          _id: this.runId,
          conversationId: this.conversationId,
          responseId: this.observability?.responseId ?? this.runId,
          state: "running",
        },
        saved,
        this.audit.length - 1,
      ),
    );
    this.wake?.();
    this.wake = null;
    this.notification = null;
  }
}

type NativeMetadata = {
  toolCallId?: string;
  traceId?: string;
  spanId?: string;
};
class Invocation {
  constructor(
    readonly scope: NexoRunContext,
    readonly native: NativeMetadata,
    readonly log?: (
      level: "info" | "warn",
      message: string,
      data: Record<string, unknown>,
    ) => void,
  ) {}
}
/** Read only native correlation identifiers and structured logging, never native payloads. */
export function toolScope(value: unknown): unknown {
  const context = value as
    | {
        requestContext?: { get?: (key: string) => unknown };
        agent?: { toolCallId?: unknown };
        tracingContext?: {
          currentSpan?: { traceId?: unknown; id?: unknown; isValid?: boolean };
        };
        observe?: {
          log?: (
            level: "info" | "warn",
            message: string,
            data: Record<string, unknown>,
          ) => void;
        };
      }
    | undefined;
  const scope = context?.requestContext?.get?.("nexo");
  if (!(scope instanceof NexoRunContext)) return scope;
  const native: NativeMetadata = {};
  if (
    typeof context?.agent?.toolCallId === "string" &&
    /^[\w-]{1,120}$/.test(context.agent.toolCallId)
  )
    native.toolCallId = context.agent.toolCallId;
  const span = context?.tracingContext?.currentSpan;
  if (
    span?.isValid &&
    typeof span.traceId === "string" &&
    /^[a-f\d]{32}$/i.test(span.traceId)
  )
    native.traceId = span.traceId;
  if (
    span?.isValid &&
    typeof span.id === "string" &&
    /^[a-f\d]{16}$/i.test(span.id)
  )
    native.spanId = span.id;
  const log = context?.observe?.log
    ? (
        level: "info" | "warn",
        message: string,
        data: Record<string, unknown>,
      ) => {
        try {
          context.observe!.log!(level, message, data);
        } catch {
          /* Technical diagnostics do not change business outcomes. */
        }
      }
    : undefined;
  return new Invocation(scope, native, log);
}

export async function runTool<T>(
  value: unknown,
  tool: string,
  intent: AgentIntent,
  rationale: string,
  parameters: AgentAudit["parameters"],
  work: (scope: NexoRunContext) => Promise<T>,
): Promise<Result<T>> {
  const scope = value instanceof Invocation ? value.scope : value;
  if (!(scope instanceof NexoRunContext))
    return {
      ok: false,
      code: "UNAUTHENTICATED",
      error: "Contexto autenticado ausente.",
    };
  const done = scope.track();
  const started = performance.now();
  const at = new Date().toISOString();
  const entry: AgentAudit = {
    id: randomUUID(),
    sequence: scope.calls,
    kind: tool === "recordDecision" ? "model_decision" : "tool_result",
    tool,
    intent,
    rationale: operationalRationale(tool),
    parameters: safeAuditParameters(parameters),
    outcome: "failure",
    state: "not_started",
    evidenceIds: [],
    at,
    startedAt: at,
    ...(value instanceof Invocation ? { native: value.native } : {}),
  };
  let workStarted = false;
  try {
    if (scope.signal.aborted)
      throw new AppError("TIMEOUT", "A execução foi interrompida.");
    const user = await scope.authenticate();
    if (user.role !== "chat" || user.uid !== scope.userId)
      throw new AppError("FORBIDDEN", "Contexto inválido.");
    entry.sequence = ++scope.calls;
    if (scope.calls > 8)
      throw new AppError(
        "TOOL_LIMIT",
        "Limite de consultas atingido. Faça uma nova solicitação.",
      );
    if (scope.handoffRequested)
      throw new AppError(
        "HUMAN_CONTROL",
        "Conversa encaminhada para atendimento humano.",
      );
    await scope.assertActive();
    entry.state = "running";
    await scope.record(entry);
    workStarted = true;
    if (value instanceof Invocation)
      value.log?.("info", "nexo.tool.started", {
        runId: scope.runId,
        eventId: entry.id,
        tool,
      });
    const data = await work(scope);
    const facts = actionFacts(tool, data);
    const result: AgentAudit = {
      ...entry,
      facts,
      outcome: "success",
      state: data === undefined ? "unknown" : "succeeded",
      durationMs: Math.max(0, performance.now() - started),
      evidenceIds: [
        ...(facts?.articles?.map((article) => article.id) ?? []),
        ...(facts?.tickets?.map((ticket) => ticket.id) ?? []),
        ...(facts?.draftId ? [facts.draftId] : []),
      ].slice(0, 16),
    };
    await scope.record(result);
    if (value instanceof Invocation)
      value.log?.("info", "nexo.tool.finished", {
        runId: scope.runId,
        eventId: entry.id,
        tool,
        state: result.state,
        durationMs: result.durationMs,
      });
    return { ok: true, data };
  } catch (error) {
    const code =
      error instanceof AppError
        ? error.code
        : error instanceof ZodError
          ? "VALIDATION"
          : "TOOL_FAILED";
    const failed: AgentAudit = {
      ...entry,
      kind: "service_validation",
      outcome: "failure",
      code,
      state: !workStarted
        ? "not_started"
        : [
              "TEMPORARILY_UNAVAILABLE",
              "TOOL_FAILED",
              "PERSISTENCE_UNAVAILABLE",
              "TIMEOUT",
              "HUMAN_CONTROL",
            ].includes(code)
          ? "unknown"
          : "failed",
      durationMs: Math.max(0, performance.now() - started),
    };
    try {
      await scope.record(failed);
    } catch {
      await scope.record(
        { ...failed, state: workStarted ? "unknown" : "not_started" },
        false,
      );
    }
    if (value instanceof Invocation)
      value.log?.("warn", "nexo.tool.unconfirmed", {
        runId: scope.runId,
        eventId: entry.id,
        tool,
        code,
      });
    return {
      ok: false,
      code,
      error:
        error instanceof AppError
          ? error.message
          : "Não foi possível concluir a consulta. Verifique os dados ou tente mais tarde.",
    };
  } finally {
    done();
  }
}
