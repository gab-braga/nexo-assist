import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { runTool } from "../context";
import { IntentSchema, rationaleSchema, ToolResultSchema } from "../schemas";
import {
  TicketDataSchema,
  PrepareTicketSchema,
  TicketListSchema,
} from "@/server/schemas/tickets";
import { IdSchema } from "@/server/schemas/uuid";
import { ticketPriority } from "@/server/policies/tickets";
import type { ticketService } from "@/server/services/tickets";
import type { listKnowledgeArticles } from "@/server/services/knowledge";
import type { TicketDTO } from "@/types/tickets";

function ticketSummary(ticket: TicketDTO) {
  const { description: _description, ...summary } = ticket;
  void _description;
  return summary;
}

export function createNexoTools(services: {
  tickets: typeof ticketService;
  knowledge: typeof listKnowledgeArticles;
}) {
  return {
    recordDecision: createTool({
      id: "recordDecision",
      description:
        "Registra intenção e justificativa objetiva da próxima ação; não representa sucesso da operação.",
      inputSchema: z
        .object({ intent: IntentSchema, rationale: rationaleSchema })
        .strict(),
      outputSchema: ToolResultSchema,
      execute: async (input, context) =>
        runTool(
          context?.requestContext?.get("nexo"),
          "recordDecision",
          input.intent,
          input.rationale,
          {},
          async () => ({ recorded: true }),
        ),
    }),
    searchKnowledgeBase: createTool({
      id: "searchKnowledgeBase",
      description:
        "Busca artigos reais por palavra ou expressão literal. Retorna conteúdo e condições de aplicabilidade; não invente artigos.",
      inputSchema: z
        .object({
          search: z.string().trim().min(2).max(160),
          rationale: rationaleSchema,
        })
        .strict(),
      outputSchema: ToolResultSchema,
      execute: async (input, context) =>
        runTool(
          context?.requestContext?.get("nexo"),
          "searchKnowledgeBase",
          "knowledge",
          input.rationale,
          { queryLength: input.search.length },
          async () =>
            (await services.knowledge({ search: input.search }))
              .slice(0, 6)
              .map((article) => ({
                ...article,
                content: article.content.slice(0, 2000),
                truncated: article.content.length > 2000,
              })),
        ),
    }),
    listUserTickets: createTool({
      id: "listUserTickets",
      description:
        "Lista apenas os chamados do funcionário autenticado. Use search para título/número, overdue para vencidos e cursor para outras páginas.",
      inputSchema: z
        .object({ query: TicketListSchema, rationale: rationaleSchema })
        .strict(),
      outputSchema: ToolResultSchema,
      execute: async (input, context) =>
        runTool(
          context?.requestContext?.get("nexo"),
          "listUserTickets",
          "tickets",
          input.rationale,
          { overdue: input.query.overdue, status: input.query.status ?? "all" },
          async () => {
            const page = await services.tickets.listMyTickets({
              ...input.query,
              limit: Math.min(input.query.limit, 5),
            });
            return { ...page, items: page.items.map(ticketSummary) };
          },
        ),
    }),
    getTicketDetails: createTool({
      id: "getTicketDetails",
      description:
        "Consulta detalhes de um chamado próprio por UUID obtido da listagem. Não revela chamados de outros funcionários.",
      inputSchema: z
        .object({ ticketId: IdSchema, rationale: rationaleSchema })
        .strict(),
      outputSchema: ToolResultSchema,
      execute: async (input, context) =>
        runTool(
          context?.requestContext?.get("nexo"),
          "getTicketDetails",
          "tickets",
          input.rationale,
          { ticketId: input.ticketId },
          async (scope) => {
            const ticket = await services.tickets.getTicket(input.ticketId);
            await scope.rememberContext({ selectedTicketId: ticket._id });
            return ticket;
          },
        ),
    }),
    getTicketStatus: createTool({
      id: "getTicketStatus",
      description:
        "Consulta status, prazo real de resposta e vencimento de um chamado próprio por UUID.",
      inputSchema: z
        .object({ ticketId: IdSchema, rationale: rationaleSchema })
        .strict(),
      outputSchema: ToolResultSchema,
      execute: async (input, context) =>
        runTool(
          context?.requestContext?.get("nexo"),
          "getTicketStatus",
          "status",
          input.rationale,
          { ticketId: input.ticketId },
          async (scope) => {
            const ticket = await services.tickets.getTicket(input.ticketId);
            await scope.rememberContext({ selectedTicketId: ticket._id });
            return {
              _id: ticket._id,
              number: ticket.number,
              status: ticket.status,
              priority: ticket.priority,
              nextResponseDueAt: ticket.nextResponseDueAt,
              overdue: ticket.overdue,
            };
          },
        ),
    }),
    findDuplicateTickets: createTool({
      id: "findDuplicateTickets",
      description:
        "Busca possíveis duplicados próprios abertos e resolvidos recentes. Consulte antes de preparar abertura; peça seleção se ambíguo.",
      inputSchema: z
        .object({ data: TicketDataSchema, rationale: rationaleSchema })
        .strict(),
      outputSchema: ToolResultSchema,
      execute: async (input, context) =>
        runTool(
          context?.requestContext?.get("nexo"),
          "findDuplicateTickets",
          "create",
          input.rationale,
          { category: input.data.category, type: input.data.type },
          async () => {
            const candidates = await services.tickets.findPossibleDuplicates(
              input.data,
            );
            return {
              items: candidates.slice(0, 10).map(ticketSummary),
              truncated: candidates.length > 10,
            };
          },
        ),
    }),
    evaluateTicketPriority: createTool({
      id: "evaluateTicketPriority",
      description:
        "Calcula prioridade pelas regras determinísticas de impacto e urgência, sem abrir chamado.",
      inputSchema: z
        .object({
          impact: TicketDataSchema.shape.impact,
          urgency: TicketDataSchema.shape.urgency,
          rationale: rationaleSchema,
        })
        .strict(),
      outputSchema: ToolResultSchema,
      execute: async (input, context) =>
        runTool(
          context?.requestContext?.get("nexo"),
          "evaluateTicketPriority",
          "create",
          input.rationale,
          { impact: input.impact, urgency: input.urgency },
          async () => ({ priority: ticketPriority(input) }),
        ),
    }),
    prepareTicketDraft: createTool({
      id: "prepareTicketDraft",
      description:
        "Prepara operação create/update/reopen/handoff para confirmação externa do funcionário. Nunca executa alteração no chamado. Dados completos e versão são obrigatórios conforme a operação.",
      inputSchema: z
        .object({ change: PrepareTicketSchema, rationale: rationaleSchema })
        .strict(),
      outputSchema: ToolResultSchema,
      execute: async (input, context) =>
        runTool(
          context?.requestContext?.get("nexo"),
          "prepareTicketDraft",
          input.change.operation === "handoff"
            ? "handoff"
            : input.change.operation,
          input.rationale,
          { operation: input.change.operation },
          async (scope) => {
            // The confirmation capability MUST NOT enter model context or audit logs.
            const prepared = await services.tickets.prepareTicketChange(
              input.change,
            );
            const { token: _token, digest: _digest, ...draft } = prepared;
            void _token;
            void _digest;
            await scope.rememberContext({
              pendingDraftId: draft.draftId,
              ...(draft.operation !== "create"
                ? { selectedTicketId: draft.ticketId }
                : {}),
            });
            scope.draftSummary = `Rascunho preparado (${draft.operation}):\n${draft.data.title}\n${draft.data.description}\nTipo: ${draft.data.type} · Categoria: ${draft.data.category} · Prioridade: ${draft.priority}\nImpacto: ${draft.data.impact} · Urgência: ${draft.data.urgency}\nFuncionário afetado: ${draft.affectedEmployee.name}\nNenhum chamado foi criado ou alterado. A operação aguarda confirmação explícita no fluxo autorizado, cuja integração visual será disponibilizada na próxima fase.`;
            return { ...draft, confirmationRequired: true, executed: false };
          },
        ),
    }),
    requestHumanHandoff: createTool({
      id: "requestHumanHandoff",
      description:
        "Encaminha esta conversa à fila humana com resumo factual; pausa IA. Não cria nem altera chamado. Use em pedido explícito, criticidade, vencimento ou insegurança.",
      inputSchema: z
        .object({
          reason: z.enum(["requested", "critical", "overdue", "uncertain"]),
          summary: z.string().trim().min(5).max(1500),
          rationale: rationaleSchema,
        })
        .strict(),
      outputSchema: ToolResultSchema,
      execute: async (input, context) =>
        runTool(
          context?.requestContext?.get("nexo"),
          "requestHumanHandoff",
          "handoff",
          input.rationale,
          { reason: input.reason },
          async (scope) => {
            await scope.requestHandoff(input.reason, input.summary);
            scope.handoffRequested = true;
            return { state: "waiting_human", executed: true };
          },
        ),
    }),
  };
}
