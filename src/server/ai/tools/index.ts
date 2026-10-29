import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { runTool } from "../context";
import {
  IntentSchema,
  rationaleSchema,
  ToolResultSchema,
  ConversationFlowSchema,
} from "../schemas";
import { knowledgeGuidance } from "@/server/policies/knowledge-guidance";
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
    cancelPendingOperation: createTool({
      id: "cancelPendingOperation",
      description:
        "Cancela a proposta pendente desta conversa quando o funcionário desistir ou mudar de intenção. Nunca desfaz uma operação já aplicada.",
      inputSchema: z.object({ rationale: rationaleSchema }).strict(),
      outputSchema: ToolResultSchema,
      execute: async (input, context) =>
        runTool(
          context?.requestContext?.get("nexo"),
          "cancelPendingOperation",
          "clarify",
          input.rationale,
          {},
          async (scope) => {
            const result = await services.tickets.cancelPendingOperation(
              scope.conversationId,
              scope.runId,
            );
            await scope.rememberContext({
              pendingDraftId: null,
              flow: { intent: "clarify", stage: "idle" },
            });
            return result;
          },
        ),
    }),
    getTicketHistory: createTool({
      id: "getTicketHistory",
      description:
        "Consulta atualizações reais de um chamado próprio já selecionado. Não invente a última atualização.",
      inputSchema: z
        .object({ ticketId: IdSchema, rationale: rationaleSchema })
        .strict(),
      outputSchema: ToolResultSchema,
      execute: async (input, context) =>
        runTool(
          context?.requestContext?.get("nexo"),
          "getTicketHistory",
          "status",
          input.rationale,
          { ticketId: input.ticketId },
          async () =>
            (await services.tickets.getTicketHistory(input.ticketId))
              .slice(-10)
              .map((event) => ({
                operation: event.operation,
                at: event.createdAt,
                title: event.after.title,
                status: event.after.status,
              })),
        ),
    }),
    updateConversationFlow: createTool({
      id: "updateConversationFlow",
      description:
        "Persiste intenção, dados parciais já informados, ambiente, pergunta e até quatro opções rápidas. Use antes de pedir dados ou mudar de intenção; não confirma operações nem modifica segurança.",
      inputSchema: z
        .object({ state: ConversationFlowSchema, rationale: rationaleSchema })
        .strict(),
      outputSchema: ToolResultSchema,
      execute: async (input, context) =>
        runTool(
          context?.requestContext?.get("nexo"),
          "updateConversationFlow",
          input.state.intent,
          input.rationale,
          {
            stage: input.state.stage,
            source: "model_inference",
            ...(input.state.data?.type ? { type: input.state.data.type } : {}),
            ...(input.state.data?.category
              ? { category: input.state.data.category }
              : {}),
          },
          async (scope) => {
            await scope.rememberContext({
              flow: input.state,
              ...(input.state.stage === "idle" ? { pendingDraftId: null } : {}),
            });
            return { saved: true };
          },
        ),
    }),
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
          environment: z.string().trim().max(120).optional(),
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
              .map((article) => knowledgeGuidance(article, input.environment)),
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
          async (scope) => {
            const page = await services.tickets.listMyTickets({
              ...input.query,
              limit: Math.min(input.query.limit, 5),
            });
            if (page.items.length > 1)
              await scope.rememberContext({
                flow: {
                  intent: "tickets",
                  stage: "selecting",
                  ticketIds: page.items.map((ticket) => ticket._id),
                  question: "Qual chamado você deseja consultar?",
                },
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
            await scope.rememberContext({
              selectedTicketId: ticket._id,
              flow: { intent: "status", stage: "idle" },
            });
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
            await scope.rememberContext({
              selectedTicketId: ticket._id,
              flow: { intent: "status", stage: "idle" },
            });
            return {
              _id: ticket._id,
              number: ticket.number,
              status: ticket.status,
              priority: ticket.priority,
              nextResponseDueAt: ticket.nextResponseDueAt,
              overdue: ticket.overdue,
              handoffReason:
                ticket.priority === "critical"
                  ? "critical"
                  : ticket.overdue
                    ? "overdue"
                    : null,
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
          async (scope) => {
            const candidates = await services.tickets.findPossibleDuplicates(
              input.data,
            );
            if (candidates.length)
              await scope.rememberContext({
                flow: {
                  intent: "create",
                  stage: "selecting",
                  ticketIds: candidates.slice(0, 5).map((ticket) => ticket._id),
                  question:
                    "Já existe um chamado semelhante. Qual deles corresponde ao problema?",
                },
              });
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
              { conversationId: scope.conversationId, runId: scope.runId },
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
            scope.draftSummary = `Rascunho preparado (${draft.operation}):\n${draft.data.title}\n${draft.data.description}\nTipo: ${draft.data.type} · Categoria: ${draft.data.category} · Prioridade: ${draft.priority}\nPrazo de resposta: ${draft.sla}\nFuncionário afetado: ${draft.affectedEmployee.name}\nNenhum chamado foi criado ou alterado. Revise o rascunho e use Confirmar operação para executar. Para corrigir, descreva a alteração; para desistir, use Cancelar.`;
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
