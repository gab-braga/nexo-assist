import {
  CheckCircle2,
  CircleHelp,
  CircleX,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import type { AgentAction } from "@/lib/schemas/agent-actions";
import type { Message } from "@/types/domain";
import { cn } from "@/lib/utils";

type Props = {
  actions?: AgentAction[];
  analyst?: boolean;
  metrics?: Message["observability"];
};

const stateNames = {
  running: "Em andamento",
  succeeded: "Concluída",
  failed: "Falhou",
  not_started: "Não iniciada",
  unknown: "Resultado desconhecido",
};

const sources = {
  model: "Interpretação proposta pelo modelo",
  service: "Resultado do serviço",
  rule: "Regra determinística",
};

function StateIcon({ state }: { state: AgentAction["state"] }) {
  return state === "running" ? (
    <LoaderCircle aria-hidden className="size-3.5 shrink-0 animate-spin" />
  ) : state === "succeeded" ? (
    <CheckCircle2 aria-hidden className="size-3.5 shrink-0 text-emerald-700" />
  ) : state === "failed" || state === "not_started" ? (
    <CircleX aria-hidden className="size-3.5 shrink-0 text-amber-700" />
  ) : (
    <CircleHelp aria-hidden className="size-3.5 shrink-0 text-amber-700" />
  );
}

export function AgentActions({
  actions = [],
  analyst = false,
  metrics,
}: Props) {
  if (!actions.length && !metrics) return null;
  return (
    <section
      data-visual="agent-actions"
      data-action-message-id={actions[0]?.messageId}
      aria-label="Ações do atendimento"
      className={cn(
        "mb-2 max-w-150.25 min-w-0 shrink-0 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground",
        analyst && "ml-auto self-end",
      )}
    >
      <p className="mb-2 flex items-center gap-1.5 font-medium">
        <ShieldCheck aria-hidden size={14} />
        Ações realizadas
      </p>
      <ul
        aria-live="polite"
        aria-relevant="additions text"
        className="space-y-1.5"
      >
        {actions.slice(-3).map((action) => (
          <li
            key={action.id}
            data-action-id={action.id}
            data-action-state={action.state}
            className="flex items-start gap-1.5"
          >
            <StateIcon state={action.state} />
            <span className="min-w-0 wrap-break-word">
              {action.title} · {stateNames[action.state]}
            </span>
          </li>
        ))}
      </ul>
      <details className="mt-2">
        <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">
          Detalhes das ações ({actions.length})
        </summary>
        <div className="mt-2 space-y-2">
          {actions.map((action) => (
            <details
              key={action.id}
              className="rounded-lg border border-border bg-card p-2"
            >
              <summary className="cursor-pointer wrap-break-word">
                {action.title} · {stateNames[action.state]}
              </summary>
              <p className="mt-2 text-[11px]">{sources[action.source]}</p>
              <p className="mt-1 wrap-break-word">{action.summary}</p>
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                <dt>Horário</dt>
                <dd>
                  {new Date(action.at).toLocaleTimeString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}
                </dd>
                {action.durationMs !== undefined && (
                  <>
                    <dt>Duração</dt>
                    <dd>
                      {(action.durationMs / 1000).toLocaleString("pt-BR", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      s
                    </dd>
                  </>
                )}
                {analyst && action.tool && (
                  <>
                    <dt>Ferramenta</dt>
                    <dd className="wrap-anywhere">{action.tool}</dd>
                  </>
                )}
                {action.details.map((detail, index) => (
                  <div key={index} className="contents">
                    <dt>{detail.label}</dt>
                    <dd className="wrap-break-word">{detail.value}</dd>
                  </div>
                ))}
              </dl>
              {action.evidence.length > 0 && (
                <ul
                  className="mt-2 space-y-1"
                  aria-label="Informações consultadas"
                >
                  {action.evidence.map((item, index) => (
                    <li
                      key={`${item.kind}:${item.id}:${index}`}
                      className="wrap-anywhere"
                    >
                      {item.kind === "article"
                        ? "Artigo"
                        : item.kind === "ticket"
                          ? "Chamado"
                          : "Proposta"}
                      : {item.label}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          ))}
          {analyst && metrics && (
            <details className="rounded-lg border border-border bg-card p-2">
              <summary className="cursor-pointer">
                Diagnóstico da execução
              </summary>
              <dl className="mt-2 space-y-1">
                <dt>Execução</dt>
                <dd className="wrap-anywhere">{metrics.runId}</dd>
                <dt>Modelo</dt>
                <dd>{metrics.model}</dd>
                {metrics.elapsedMs !== undefined && (
                  <>
                    <dt>Duração total</dt>
                    <dd>{(metrics.elapsedMs / 1000).toFixed(2)} s</dd>
                  </>
                )}
                {metrics.inputTokens !== undefined && (
                  <>
                    <dt>Tokens de entrada / saída</dt>
                    <dd>
                      {metrics.inputTokens} /{" "}
                      {metrics.outputTokens ?? "não disponível"}
                    </dd>
                  </>
                )}
                {metrics.traceId && (
                  <>
                    <dt>Referência técnica do trace</dt>
                    <dd className="wrap-anywhere">{metrics.traceId}</dd>
                  </>
                )}
              </dl>
            </details>
          )}
        </div>
      </details>
    </section>
  );
}
