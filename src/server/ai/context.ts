import "server-only";
import { ZodError } from "zod";
import { AppError } from "@/server/lib/errors";
import type {
  SessionUser,
  Result,
  ConversationContextPatch,
} from "@/types/domain";
import type { AgentAudit, AgentIntent } from "@/types/ai";

export class NexoRunContext {
  calls = 0;
  handoffRequested = false;
  draftSummary: string | null = null;
  readonly audit: AgentAudit[] = [];
  constructor(
    readonly userId: string,
    readonly conversationId: string,
    readonly runId: string,
    readonly signal: AbortSignal,
    readonly authenticate: () => Promise<SessionUser>,
    readonly assertActive: () => Promise<void>,
    readonly requestHandoff: (reason: string, summary: string) => Promise<void>,
    readonly rememberContext: (
      patch: ConversationContextPatch,
    ) => Promise<void>,
  ) {}
}

export async function runTool<T>(
  value: unknown,
  tool: string,
  intent: AgentIntent,
  rationale: string,
  parameters: AgentAudit["parameters"],
  work: (scope: NexoRunContext) => Promise<T>,
): Promise<Result<T>> {
  if (!(value instanceof NexoRunContext))
    return {
      ok: false,
      code: "UNAUTHENTICATED",
      error: "Contexto autenticado ausente.",
    };
  const scope = value;
  try {
    if (scope.signal.aborted)
      throw new AppError("TIMEOUT", "A execução foi interrompida.");
    const user = await scope.authenticate();
    if (user.role !== "chat" || user.uid !== scope.userId)
      throw new AppError("FORBIDDEN", "Contexto inválido.");
    if (++scope.calls > 8)
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
    const data = await work(scope);
    const json = JSON.stringify(data);
    // Evidence references only: never persist full tool output, token or article text.
    const evidenceIds = [
      ...json.matchAll(/"(?:_id|draftId)":"([a-zA-Z0-9-]+)"/g),
    ]
      .slice(0, 20)
      .map((match) => match[1]);
    scope.audit.push({
      kind: tool === "recordDecision" ? "model_decision" : "tool_result",
      tool,
      intent,
      rationale,
      parameters,
      outcome: "success",
      evidenceIds,
      at: new Date().toISOString(),
    });
    return { ok: true, data };
  } catch (error) {
    const code =
      error instanceof AppError
        ? error.code
        : error instanceof ZodError
          ? "VALIDATION"
          : "TOOL_FAILED";
    scope.audit.push({
      kind: "service_validation",
      tool,
      intent,
      rationale,
      parameters,
      outcome: "failure",
      code,
      evidenceIds: [],
      at: new Date().toISOString(),
    });
    return {
      ok: false,
      code,
      error:
        error instanceof AppError
          ? error.message
          : "Não foi possível concluir a consulta. Verifique os dados ou tente mais tarde.",
    };
  }
}
