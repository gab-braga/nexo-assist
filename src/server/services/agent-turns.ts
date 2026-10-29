import "server-only";
import { RequestContext } from "@mastra/core/request-context";
import { AppError } from "@/server/lib/errors";
import {
  agentRunRepository,
  type AgentRunRepository,
} from "@/server/repositories/agent-runs";
import { AgentTurnSchema } from "@/server/ai/schemas";
import { AI_LIMITS, aiModelId, ensureAIConfigured } from "@/server/ai/config";
import { NexoRunContext } from "@/server/ai/context";
import type { requireUser } from "@/auth/guards";
import type { nexoAgent } from "@/server/ai/agents/nexo-agent";
import type { AgentRun, AgentStreamEvent } from "@/types/ai";
import type { Message } from "@/types/domain";
import type { CoreMessage } from "@mastra/core/llm";
import { buildAgentMemory } from "@/server/ai/memory";
import { actionStream } from "@/server/ai/action-stream";
import { functionalActions } from "@/server/policies/agent-actions";

export function agentError(error: unknown): { code: string; error: string } {
  if (error instanceof AppError)
    return { code: error.code, error: error.message };
  if (
    error instanceof Error &&
    (error.name.includes("Timeout") || error.name === "AbortError")
  )
    return {
      code: "TIMEOUT",
      error:
        "O atendimento demorou mais que o esperado. Tente novamente mais tarde.",
    };
  return {
    code: "AI_UNAVAILABLE",
    error:
      "O assistente não conseguiu responder agora. Tente novamente mais tarde.",
  };
}

export function providerFailureMetadata(error: unknown) {
  if (!error || typeof error !== "object") return { kind: "UnknownError" };
  const kind = error instanceof Error ? error.name : "UnknownError";
  const status =
    "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : undefined;
  let providerCode: string | undefined;
  if ("responseBody" in error && typeof error.responseBody === "string") {
    try {
      const parsed: unknown = JSON.parse(error.responseBody);
      if (
        parsed &&
        typeof parsed === "object" &&
        "error" in parsed &&
        parsed.error &&
        typeof parsed.error === "object" &&
        "code" in parsed.error &&
        typeof parsed.error.code === "string" &&
        /^[a-z_]{1,64}$/.test(parsed.error.code)
      )
        providerCode = parsed.error.code;
    } catch {
      /* never log response bodies */
    }
  }
  return { kind, status, providerCode };
}

function dto(message: Message, run?: AgentRun, audit = run?.audit ?? []) {
  return {
    ...message,
    createdAt: message.createdAt.toISOString(),
    ...(run
      ? {
          actions: functionalActions(run, audit, message._id),
        }
      : {}),
  };
}

export function recentAgentContext(messages: Message[]) {
  return buildAgentMemory({
    initialMessage: messages[0] ?? null,
    recentMessages: messages,
    selectedTicket: null,
    pendingOperation: null,
  });
}

export function createAgentTurnService(deps: {
  authenticate: typeof requireUser;
  repository: AgentRunRepository;
  configured: () => void;
  agent: () => Promise<typeof nexoAgent>;
}) {
  return async function startAgentTurn(
    input: unknown,
    clientSignal: AbortSignal,
  ) {
    const user = await deps.authenticate("chat");
    const query = AgentTurnSchema.parse(input);
    deps.configured();
    const run = await deps.repository.begin(user, query, aiModelId());
    const authenticate = async () => deps.authenticate("chat");
    return (async function* (): AsyncGenerator<AgentStreamEvent> {
      let terminal = run.state !== "running";
      let scope: NexoRunContext | null = null;
      let execution: AbortController | null = null;
      let usage: AgentRun["usage"] = null;
      try {
        yield {
          type: "started",
          runId: run._id,
          conversationId: run.conversationId,
        };
        if (run.state !== "running") {
          if (run.state === "completed" && run.response)
            yield {
              type: "completed",
              message: dto(
                {
                  _id: run.responseId,
                  conversationId: run.conversationId,
                  role: "assistant",
                  authorId: "nexo-assist",
                  authorName: "Nexo Assist",
                  text: run.response,
                  createdAt:
                    run.responseCreatedAt ?? run.completedAt ?? run.createdAt,
                  sequence: run.responseSequence ?? undefined,
                  runId: run._id,
                  processingState: "completed",
                  decisionRefs: run.audit.map(
                    (entry, index) => entry.id ?? `${run._id}:${index}`,
                  ),
                },
                run,
              ),
            };
          else
            yield {
              type: "error",
              code: run.errorCode ?? "AI_UNAVAILABLE",
              error:
                "Esta execução foi interrompida. Envie uma nova mensagem para tentar novamente.",
            };
          return;
        }
        const timeout = AbortSignal.timeout(AI_LIMITS.timeoutMs);
        const transferred = (execution = new AbortController());
        const signal = AbortSignal.any([
          clientSignal,
          timeout,
          transferred.signal,
        ]);
        scope = new NexoRunContext(
          user.uid,
          run.conversationId,
          run._id,
          signal,
          authenticate,
          () => deps.repository.assertActive(run),
          async (reason, summary) => {
            const notice = await deps.repository.handoff(
              run,
              reason,
              summary,
              scope?.audit,
            );
            if (notice) {
              scope!.handoffMessage = notice;
              transferred.abort();
            }
            return notice;
          },
          (patch) => deps.repository.remember(run, patch),
          {
            responseId: run.responseId,
            persist: (entry) => deps.repository.recordAudit(run, entry),
          },
        );
        const requestContext = new RequestContext<{ nexo: NexoRunContext }>();
        requestContext.set("nexo", scope);
        try {
          const messages: CoreMessage[] = buildAgentMemory(
            await deps.repository.loadContext(run),
            run._id,
          );
          const agent = await deps.agent();
          const output = await agent.stream(messages, {
            runId: run._id,
            requestContext,
            abortSignal: signal,
            maxSteps: AI_LIMITS.steps,
            modelSettings: {
              maxOutputTokens: AI_LIMITS.outputTokens,
              maxRetries: 0,
            },
            providerOptions: {
              openai: { reasoningEffort: "low", store: false },
            },
          });
          let text = "";
          let buffered = "";
          let flushedAt = Date.now();
          for await (const item of actionStream(output.fullStream, scope)) {
            if (item.kind === "action") {
              yield { type: "action", action: item.action };
              continue;
            }
            const chunk = item.chunk;
            if (scope.handoffMessage) break;
            if (signal.aborted)
              throw new AppError(
                "TIMEOUT",
                "O atendimento foi interrompido. Tente novamente mais tarde.",
              );
            if (chunk.type === "error") {
              const metadata = providerFailureMetadata(chunk.payload.error);
              console.error("Agent provider failed", {
                runId: run._id,
                ...metadata,
              });
              throw new AppError(
                metadata.status === 429
                  ? "AI_PROVIDER_LIMIT"
                  : "AI_UNAVAILABLE",
                metadata.status === 429
                  ? "O assistente está temporariamente indisponível por um limite do provedor. A equipe de TI precisa verificar o serviço."
                  : "O assistente não conseguiu concluir a resposta.",
              );
            }
            if (chunk.type === "abort")
              throw new AppError("TIMEOUT", "O atendimento foi interrompido.");
            if (
              chunk.type === "text-delta" &&
              !scope.handoffRequested &&
              !scope.draftSummary
            ) {
              const delta = chunk.payload.text;
              text += delta;
              buffered += delta;
              if (text.length > 16000)
                throw new AppError(
                  "OUTPUT_LIMIT",
                  "A resposta excedeu o limite. Faça uma pergunta mais específica.",
                );
              if (buffered.length >= 64 || Date.now() - flushedAt >= 120) {
                await deps.repository.assertActive(run);
                yield { type: "delta", text: buffered };
                buffered = "";
                flushedAt = Date.now();
              }
            }
          }
          if (scope.handoffMessage) {
            await scope.settle();
            terminal = true;
            yield {
              type: "completed",
              message: dto(scope.handoffMessage, run, scope.audit),
            };
            return;
          }
          const consumed = await output.usage;
          usage = {
            inputTokens: consumed.inputTokens ?? 0,
            outputTokens: consumed.outputTokens ?? 0,
          };
          if (output.error) throw output.error;
          if (buffered && !scope.handoffRequested && !scope.draftSummary) {
            await deps.repository.assertActive(run);
            yield { type: "delta", text: buffered };
          }
          if (scope.draftSummary) text = scope.draftSummary;
          if (scope.handoffRequested)
            text =
              "Sua conversa foi encaminhada à fila de atendimento humano. O Nexo Assist ficará pausado enquanto você aguarda um analista.";
          if (!text.trim())
            throw new AppError(
              "AI_UNAVAILABLE",
              "O assistente não concluiu uma resposta. Tente novamente com mais detalhes.",
            );
          if (signal.aborted) throw signal.reason;
          const saved = await deps.repository.finish(
            run,
            text,
            scope.audit,
            usage,
          );
          if (!saved)
            throw new AppError(
              "HUMAN_CONTROL",
              "A conversa passou ao atendimento humano. Atualize para acompanhar.",
            );
          terminal = true;
          yield { type: "completed", message: dto(saved, run, scope.audit) };
        } catch (error) {
          if (scope.handoffMessage) {
            await scope.settle();
            terminal = true;
            yield {
              type: "completed",
              message: dto(scope.handoffMessage, run, scope.audit),
            };
            return;
          }
          console.error("Agent execution failed", {
            runId: run._id,
            ...providerFailureMetadata(error),
          });
          const failure = clientSignal.aborted
            ? {
                code: "RUN_INTERRUPTED",
                error:
                  "A resposta foi interrompida. Seu histórico foi preservado; nenhuma operação será repetida automaticamente.",
              }
            : agentError(error);
          await scope.settle();
          while (scope.pendingActions.length)
            yield { type: "action", action: scope.pendingActions.shift()! };
          // Only sanitized codes/metadata are persisted. No provider request bodies.
          await deps.repository.finish(
            run,
            null,
            scope.audit,
            usage,
            failure.code,
          );
          terminal = true;
          yield { type: "error", ...failure };
        }
      } finally {
        execution?.abort();
        await scope?.settle();
        // Closing a reader, including before its first delta, never replays tools.
        if (!terminal) {
          try {
            await deps.repository.finish(
              run,
              null,
              scope?.audit ?? [],
              usage,
              "RUN_INTERRUPTED",
            );
          } catch {
            console.error("Agent interruption persistence unavailable", {
              runId: run._id,
            });
          }
        }
      }
    })();
  };
}

export const startAgentTurn = createAgentTurnService({
  authenticate: async (role) =>
    (await import("@/auth/guards")).requireUser(role),
  repository: agentRunRepository,
  configured: ensureAIConfigured,
  agent: async () => (await import("@/server/ai")).nexoAgent,
});
