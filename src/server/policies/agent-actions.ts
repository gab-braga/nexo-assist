import type { AgentAudit, AgentRun } from "@/types/ai";
import type { AgentAction } from "@/lib/schemas/agent-actions";
import { priorityNames } from "@/lib/ticket-display";
import type { TicketPriority, TicketData } from "@/types/tickets";
import { ticketPriority } from "@/server/policies/tickets";

const labels: Record<string, [string, string]> = {
  recordDecision: ["INTENT_IDENTIFIED", "Intenção proposta pelo modelo"],
  updateConversationFlow: [
    "INTERPRETATION_PROPOSED",
    "Organização das informações",
  ],
  searchKnowledgeBase: ["KNOWLEDGE_SEARCH", "Consulta à central de ajuda"],
  listUserTickets: ["TICKET_SEARCH", "Consulta de chamados"],
  getTicketDetails: ["TICKET_SELECTED", "Consulta do chamado selecionado"],
  getTicketStatus: ["TICKET_SELECTED", "Verificação de status e prazo"],
  getTicketHistory: ["TICKET_SEARCH", "Consulta de atualizações"],
  findDuplicateTickets: ["DUPLICATE_CHECK", "Verificação de duplicidade"],
  evaluateTicketPriority: ["PRIORITY_EVALUATED", "Avaliação de prioridade"],
  prepareTicketDraft: ["CONFIRMATION_REQUESTED", "Preparação do rascunho"],
  cancelPendingOperation: ["TOOL_EXECUTION", "Cancelamento da proposta"],
  requestHumanHandoff: ["TOOL_EXECUTION", "Solicitação de atendimento humano"],
};

export function safeActionText(value: string, max = 180) {
  return value
    .replace(
      /\b(senha|password|token|api[_-]?key|authorization)\s*[:=]\s*(?:Bearer\s+)?\S+/gi,
      "$1: [omitido]",
    )
    .replace(/([a-z][a-z\d+.-]*:\/\/)[^\s/@]+@/gi, "$1[omitido]@")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[omitido]")
    .replace(/\bsk-[\w-]+/g, "[omitido]")
    .replace(/\b[A-Za-z0-9_-]{60,}\b/g, "[omitido]")
    .slice(0, max);
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const enums: Record<string, string[]> = {
  impact: ["person", "team", "company"],
  urgency: ["blocked", "today", "workaround", "normal"],
  priority: ["critical", "high", "medium", "low"],
  operation: ["create", "update", "reopen", "handoff"],
  reason: ["requested", "critical", "overdue", "uncertain"],
  type: ["INC", "REQ"],
  category: [
    "Acesso",
    "Rede e VPN",
    "Hardware",
    "Software",
    "E-mail",
    "Outros",
  ],
  status: ["all", "open", "resolved", "waiting_human"],
  stage: [
    "idle",
    "collecting",
    "selecting",
    "knowledge",
    "awaiting_confirmation",
  ],
  source: ["model_inference"],
};

export function safeAuditParameters(
  input: AgentAudit["parameters"],
): AgentAudit["parameters"] {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) =>
        (typeof value === "string" && enums[key]?.includes(value)) ||
        (key === "queryLength" &&
          typeof value === "number" &&
          value >= 0 &&
          value <= 160) ||
        (key === "overdue" && typeof value === "boolean"),
    ),
  );
}

export function operationalRationale(tool: string) {
  return labels[tool]?.[1] ?? "Execução de ferramenta do atendimento";
}

/** Whitelist only bounded facts returned by the actual service; never store raw outputs. */
export function actionFacts(tool: string, data: unknown): AgentAudit["facts"] {
  const result = object(data);
  const facts: NonNullable<AgentAudit["facts"]> = {};
  for (const field of [
    "priority",
    "impact",
    "urgency",
    "operation",
    "reason",
  ] as const)
    if (
      typeof result[field] === "string" &&
      enums[field].includes(result[field] as string)
    )
      facts[field] = result[field] as string;
  if (tool === "searchKnowledgeBase" && Array.isArray(data)) {
    facts.articles = data
      .slice(0, 6)
      .map(object)
      .filter((article) => typeof article._id === "string")
      .map((article) => ({
        id: safeActionText(String(article._id), 120),
        title: safeActionText(String(article.title ?? "Artigo")),
        ...(typeof article.applicable === "boolean"
          ? { applicable: article.applicable }
          : {}),
        ...(typeof article.requiresEnvironment === "boolean"
          ? { requiresEnvironment: article.requiresEnvironment }
          : {}),
      }));
    facts.count = facts.articles.length;
  }
  if (
    ["listUserTickets", "findDuplicateTickets"].includes(tool) &&
    Array.isArray(result.items)
  ) {
    facts.tickets = result.items
      .slice(0, 5)
      .map(object)
      .filter((ticket) => typeof ticket._id === "string")
      .map((ticket) => ({
        id: safeActionText(String(ticket._id), 120),
        number: safeActionText(String(ticket.number ?? "Chamado"), 100),
        title: safeActionText(String(ticket.title ?? "Chamado")),
      }));
    facts.count = result.items.length;
    facts.hasMore = !!result.nextCursor || result.truncated === true;
  }
  if (
    ["getTicketDetails", "getTicketStatus"].includes(tool) &&
    typeof result._id === "string"
  )
    facts.tickets = [
      {
        id: safeActionText(result._id, 120),
        number: safeActionText(String(result.number ?? "Chamado"), 100),
        title: safeActionText(String(result.title ?? "Status consultado")),
      },
    ];
  if (
    tool === "prepareTicketDraft" &&
    result.confirmationRequired === true &&
    typeof result.draftId === "string"
  ) {
    facts.draftId = safeActionText(result.draftId, 120);
    const draftData = object(result.data);
    if (
      typeof draftData.impact === "string" &&
      enums.impact.includes(draftData.impact)
    )
      facts.impact = draftData.impact;
    if (
      typeof draftData.urgency === "string" &&
      enums.urgency.includes(draftData.urgency)
    )
      facts.urgency = draftData.urgency;
  }
  return facts;
}

export function priorityExplanation(
  priority: string,
  impact?: string,
  urgency?: string,
) {
  if (!enums.priority.includes(priority) || !impact || !urgency)
    return "Prioridade retornada pelo serviço; não há dados históricos suficientes para reconstruir a regra aplicada.";
  if (
    !enums.impact.includes(impact) ||
    !enums.urgency.includes(urgency) ||
    ticketPriority({ impact, urgency } as Pick<
      TicketData,
      "impact" | "urgency"
    >) !== priority
  )
    return "Os dados disponíveis não permitem reconstruir com segurança a classificação registrada.";
  if (priority === "critical" && impact !== "person" && urgency === "blocked")
    return "Prioridade crítica: o impacto considerado é equipe/empresa e a urgência indica trabalho impedido.";
  if (priority === "high" && urgency === "blocked")
    return "Prioridade alta: a urgência considerada indica impedimento para trabalhar.";
  if (priority === "high" && urgency === "today")
    return "Prioridade alta: a urgência considerada indica compromisso no mesmo dia.";
  if (priority === "medium" && urgency === "workaround")
    return "Prioridade média: foi considerada a existência de uma alternativa de trabalho.";
  if (priority === "low" && urgency === "normal")
    return "Prioridade baixa: a urgência considerada é normal, sem impedimento ou compromisso no mesmo dia.";
  return "Os dados disponíveis não permitem reconstruir com segurança a classificação registrada.";
}

export function auditToAction(
  run: Pick<AgentRun, "_id" | "conversationId" | "responseId" | "state">,
  audit: AgentAudit,
  index: number,
  messageId = run.responseId,
): AgentAction {
  const [type, title] = labels[audit.tool] ?? [
    "TOOL_EXECUTION",
    "Operação do atendimento",
  ];
  let state =
    audit.state ?? (audit.outcome === "success" ? "succeeded" : "failed");
  if (state === "running" && run.state !== "running") state = "unknown";
  const source = ["recordDecision", "updateConversationFlow"].includes(
    audit.tool,
  )
    ? "model"
    : audit.tool === "evaluateTicketPriority"
      ? "rule"
      : "service";
  const facts = audit.facts;
  let summary =
    state === "running"
      ? `${title} em andamento.`
      : state === "not_started"
        ? "A operação não foi iniciada; uma validação do servidor impediu a execução."
        : state === "failed"
          ? "A ferramenta não concluiu a operação. Nenhum sucesso foi confirmado."
          : state === "unknown"
            ? "O resultado desta ação não pôde ser confirmado. Não repetiremos escritas automaticamente."
            : source === "model"
              ? "O modelo propôs uma interpretação; isso não confirma fatos nem executa alterações."
              : "A ferramenta concluiu a consulta ou validação registrada.";
  if (
    state === "succeeded" &&
    audit.tool === "searchKnowledgeBase" &&
    facts?.articles
  ) {
    summary = !facts.articles.length
      ? "Nenhum artigo foi encontrado nesta consulta."
      : facts.articles.some((article) => article.requiresEnvironment)
        ? "Há artigos condicionados ao ambiente. É necessário informar o sistema e a versão antes de orientar."
        : facts.articles.every((article) => article.applicable === false)
          ? "Nenhum procedimento retornado é compatível com o ambiente informado."
          : facts.articles.some((article) => article.applicable === true)
            ? "Foram encontrados artigos; somente procedimentos com condições compatíveis podem ser usados."
            : "Artigos foram retornados, mas o registro não confirma sua compatibilidade.";
  }
  if (
    state === "succeeded" &&
    audit.tool === "findDuplicateTickets" &&
    facts?.count !== undefined
  )
    summary = facts.count
      ? "Foram encontrados chamados semelhantes. A abertura deve aguardar seleção e revisão; esta consulta não criou um chamado."
      : "Nenhum chamado semelhante foi retornado. O serviço verificará duplicidade novamente antes de gravar.";
  if (
    state === "succeeded" &&
    audit.tool === "listUserTickets" &&
    facts?.count !== undefined
  )
    summary =
      facts.count > 1
        ? "Há vários chamados nesta consulta. É necessário selecionar o atendimento correto."
        : facts.count
          ? "Foi retornado um chamado do funcionário autenticado."
          : "Nenhum chamado foi encontrado nesta consulta.";
  if (
    state === "succeeded" &&
    facts?.priority &&
    audit.tool === "evaluateTicketPriority"
  )
    summary = priorityExplanation(
      facts.priority,
      String(audit.parameters.impact ?? ""),
      String(audit.parameters.urgency ?? ""),
    );
  if (state === "succeeded" && audit.tool === "prepareTicketDraft")
    summary = facts?.draftId
      ? "Rascunho preparado e aguardando confirmação explícita. O chamado ainda não foi criado ou alterado."
      : "O fluxo foi consultado; não há rascunho confirmado neste resultado.";
  if (audit.code === "DUPLICATE_TICKET")
    summary =
      "O serviço detectou um chamado semelhante e bloqueou a operação. Consulte os candidatos antes de propor outra abertura.";
  const details: AgentAction["details"] = [];
  if (source === "model") {
    const intents: Record<string, string> = {
      knowledge: "Consulta à central de ajuda",
      tickets: "Consulta de chamados",
      status: "Consulta de status",
      create: "Abertura de chamado",
      update: "Atualização",
      reopen: "Reabertura",
      handoff: "Atendimento humano",
      clarify: "Coleta de informações",
      out_of_scope: "Fora do escopo de TI",
    };
    details.push({
      label: "Intenção proposta",
      value: intents[audit.intent] ?? "Atendimento",
    });
    const parameters = safeAuditParameters(audit.parameters);
    if (parameters.type)
      details.push({ label: "Tipo proposto", value: String(parameters.type) });
    if (parameters.category)
      details.push({
        label: "Categoria proposta",
        value: String(parameters.category),
      });
  }
  for (const article of facts?.articles ?? [])
    details.push({
      label: `Artigo: ${article.title.slice(0, 60)}`,
      value: article.requiresEnvironment
        ? "É necessário informar o ambiente antes de orientar."
        : article.applicable === true
          ? "Condições verificadas como compatíveis nesta consulta."
          : article.applicable === false
            ? "Procedimento incompatível com o ambiente considerado."
            : "Compatibilidade não registrada; não é possível reconstruir essa validação.",
    });
  if (facts?.priority && enums.priority.includes(facts.priority))
    details.push({
      label: "Prioridade calculada",
      value: priorityNames[facts.priority as TicketPriority],
    });
  if (facts?.priority && audit.tool === "prepareTicketDraft")
    details.push({
      label: "Regra aplicada aos dados da proposta",
      value: priorityExplanation(facts.priority, facts.impact, facts.urgency),
    });
  if (facts?.count !== undefined)
    details.push({
      label: "Resultados nesta consulta",
      value: String(facts.count),
    });
  if (facts?.hasMore)
    details.push({
      label: "Paginação",
      value: "Existem outros resultados; esta lista é parcial.",
    });
  const evidence: AgentAction["evidence"] = [
    ...(facts?.articles?.map((article) => ({
      kind: "article" as const,
      id: article.id,
      label: article.title,
    })) ?? []),
    ...(facts?.tickets?.map((ticket) => ({
      kind: "ticket" as const,
      id: ticket.id,
      label: `${ticket.number}: ${ticket.title}`.slice(0, 180),
    })) ?? []),
    ...(facts?.draftId
      ? [
          {
            kind: "draft" as const,
            id: facts.draftId,
            label: "Rascunho para revisão",
          },
        ]
      : []),
  ].slice(0, 10);
  if (audit.code)
    details.push({
      label: "Resultado",
      value:
        audit.code === "NOT_FOUND"
          ? "Recurso não encontrado ou sem acesso; nenhum dado foi revelado."
          : ["TEMPORARILY_UNAVAILABLE", "PERSISTENCE_UNAVAILABLE"].includes(
                audit.code,
              )
            ? "Serviço indisponível; o resultado não foi confirmado."
            : "A validação ou execução retornou uma falha.",
    });
  if (
    !audit.facts &&
    state === "succeeded" &&
    !["recordDecision", "updateConversationFlow"].includes(audit.tool)
  )
    details.push({
      label: "Registro histórico",
      value:
        "O registro comprova a execução, mas não contém detalhes suficientes para reconstruir seu resultado.",
    });
  return {
    id: audit.id ?? `${run._id}:${index}`,
    conversationId: run.conversationId,
    runId: run._id,
    messageId,
    order: audit.sequence ?? index,
    type,
    title,
    summary,
    source,
    state,
    at: audit.startedAt ?? audit.at,
    ...(audit.durationMs !== undefined ? { durationMs: audit.durationMs } : {}),
    tool: labels[audit.tool] ? audit.tool : undefined,
    details,
    evidence,
  };
}

/** The legacy handoff validation is already represented by its business receipt. */
export function functionalActions(
  run: Pick<AgentRun, "_id" | "conversationId" | "responseId" | "state">,
  audit: AgentAudit[],
  messageId = run.responseId,
) {
  return audit
    .slice(0, 24)
    .flatMap((entry, index) =>
      entry.kind === "service_validation" &&
      entry.tool === "requestHumanHandoff" &&
      !entry.id &&
      entry.outcome === "success"
        ? []
        : [auditToAction(run, entry, index, messageId)],
    );
}

export function mergeAudit(
  existing: AgentAudit[],
  incoming: AgentAudit[],
): AgentAudit[] {
  const result = existing.map((entry) => ({ ...entry }));
  for (const entry of incoming) {
    const index = entry.id
      ? result.findIndex((saved) => saved.id === entry.id)
      : result.findIndex(
          (saved) =>
            !saved.id && saved.tool === entry.tool && saved.at === entry.at,
        );
    if (index < 0) {
      if (result.length < 24) result.push(entry);
    } else if (result[index].state === "running" || !result[index].state)
      result[index] = entry;
  }
  return result.sort(
    (a, b) =>
      (a.sequence ?? 99) - (b.sequence ?? 99) || a.at.localeCompare(b.at),
  );
}
