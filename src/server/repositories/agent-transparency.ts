import "server-only";
import type { Conversation, Message } from "@/types/domain";
import type { AgentRun } from "@/types/ai";
import type { TicketDraft } from "@/types/tickets";
import type { AgentAction } from "@/lib/schemas/agent-actions";
import { database } from "@/server/lib/mongodb";
import { databaseOperation } from "@/server/lib/errors";
import {
  functionalActions,
  priorityExplanation,
} from "@/server/policies/agent-actions";
import { handoffReasonNames } from "@/server/policies/handoff";

type ConversationEvent = {
  _id: string;
  conversationId: string;
  messageId?: string;
  draftId?: string;
  operation: string;
  outcome?: string;
  reason?: string;
  createdAt: Date;
};
const handoffReasons: Record<string, string> = {
  requested: "O atendimento humano foi solicitado explicitamente.",
  critical:
    "O incidente foi encaminhado por criticidade, conforme a regra de impacto e urgência.",
  overdue: "O prazo de resposta do chamado consultado está vencido.",
  uncertain:
    "O agente registrou que não possuía informações suficientes para decidir; essa avaliação é uma interpretação, não uma medida percentual.",
};

/** Reads only the visible message window after the service authorizes the conversation. */
export async function readTransparency(
  conversation: Conversation,
  messages: Message[],
  analyst: boolean,
) {
  return databaseOperation(async () => {
    const db = await database();
    const ids = messages.map((message) => message._id);
    if (!ids.length)
      return messages.map((message) => ({
        ...message,
        actions: [] as AgentAction[],
      }));
    const [runs, drafts] = await Promise.all([
      db
        .collection<AgentRun>("agent_runs")
        .find({
          conversationId: conversation._id,
          customerId: conversation.customerId,
          $or: [
            {
              _id: {
                $in: [
                  ...ids,
                  ...messages.flatMap((message) =>
                    message.runId ? [message.runId] : [],
                  ),
                ],
              },
            },
            { responseId: { $in: ids } },
          ],
        })
        .limit(50)
        .toArray(),
      db
        .collection<TicketDraft>("ticket_drafts")
        .find({
          conversationId: conversation._id,
          customerId: conversation.customerId,
          confirmationMessageId: { $in: ids },
          appliedAt: { $ne: null },
        })
        .limit(50)
        .toArray(),
    ]);
    const events = await db
      .collection<ConversationEvent>("conversation_events")
      .find({
        conversationId: conversation._id,
        $or: [
          { messageId: { $in: ids } },
          {
            draftId: { $in: drafts.map((draft) => draft._id) },
            operation: "ticket_confirmed",
          },
        ],
      })
      .limit(100)
      .toArray();
    const actions = new Map(ids.map((id) => [id, [] as AgentAction[]]));
    const metrics = new Map<string, Message["observability"]>();
    for (const run of runs) {
      const target = ids.includes(run.responseId)
        ? run.responseId
        : run.state !== "completed" && ids.includes(run._id)
          ? run._id
          : null;
      if (!target) continue;
      const entries = functionalActions(run, run.audit, target);
      if (run.errorCode)
        entries.push({
          id: `${run._id}:execution`,
          conversationId: conversation._id,
          messageId: target,
          runId: run._id,
          order: 100,
          type: "EXECUTION_FAILED",
          source: "service",
          state: run.state === "interrupted" ? "unknown" : "failed",
          title:
            run.state === "interrupted"
              ? "Execução interrompida"
              : "Resposta não concluída",
          at: (run.completedAt ?? run.createdAt).toISOString(),
          summary:
            "A execução não publicou uma resposta concluída. Consulte o histórico para verificar operações já registradas; escritas não serão repetidas automaticamente.",
          details: [],
          evidence: [],
        });
      actions.get(target)!.push(...entries);
      if (analyst) {
        const traceId = run.audit.find((entry) => entry.native?.traceId)?.native
          ?.traceId;
        metrics.set(target, {
          runId: run._id,
          model: /^[\w./-]{1,80}$/.test(run.model)
            ? run.model
            : "Modelo configurado",
          ...(run.completedAt
            ? {
                elapsedMs: Math.max(
                  0,
                  run.completedAt.getTime() - run.createdAt.getTime(),
                ),
              }
            : {}),
          ...(run.usage
            ? {
                inputTokens: run.usage.inputTokens,
                outputTokens: run.usage.outputTokens,
              }
            : {}),
          ...(traceId && /^[a-f\d]{32}$/i.test(traceId) ? { traceId } : {}),
        });
      }
    }
    for (const draft of drafts) {
      const target = draft.confirmationMessageId!;
      const proof = events.find(
        (event) =>
          event.operation === "ticket_confirmed" && event.draftId === draft._id,
      );
      if (
        !proof ||
        !draft.result ||
        draft.result.customerId !== conversation.customerId
      )
        continue;
      const names = {
        create: "Chamado criado",
        update: "Chamado atualizado",
        reopen: "Chamado reaberto",
        handoff: "Chamado encaminhado",
      };
      actions.get(target)?.push({
        id: proof._id,
        conversationId: conversation._id,
        messageId: target,
        order: 0,
        type: `TICKET_${draft.operation === "create" ? "CREATED" : draft.operation === "update" ? "UPDATED" : draft.operation === "reopen" ? "REOPENED" : "HANDOFF"}`,
        source: "service",
        state: "succeeded",
        title: names[draft.operation],
        at: proof.createdAt.toISOString(),
        summary:
          "A confirmação explícita foi validada pelo servidor e a operação foi gravada com o histórico do chamado na mesma transação.",
        details: [
          {
            label: "Confirmação",
            value:
              "Vinculada ao funcionário, à operação e aos dados apresentados.",
          },
          {
            label: "Prioridade",
            value: priorityExplanation(
              draft.result.priority,
              draft.data.impact,
              draft.data.urgency,
            ),
          },
        ],
        evidence: [
          { kind: "ticket", id: draft.result._id, label: draft.result.number },
        ],
      });
    }
    for (const event of events) {
      if (
        !event.messageId ||
        !actions.has(event.messageId) ||
        event.outcome === "failure" ||
        event.outcome === "unknown"
      )
        continue;
      if (event.operation === "request_human")
        actions.get(event.messageId)!.push({
          id: event._id,
          conversationId: conversation._id,
          messageId: event.messageId,
          order: 200,
          type: "HUMAN_HANDOFF",
          source: "service",
          state: "succeeded",
          title: "Atendimento encaminhado à fila humana",
          at: event.createdAt.toISOString(),
          summary:
            handoffReasons[event.reason ?? ""] ??
            "A mudança para atendimento humano foi registrada pelo servidor.",
          details:
            event.reason && event.reason in handoffReasonNames
              ? [
                  {
                    label: "Motivo registrado",
                    value:
                      handoffReasonNames[
                        event.reason as keyof typeof handoffReasonNames
                      ],
                  },
                ]
              : [],
          evidence: [],
        });
    }
    return messages.map((message) => ({
      ...message,
      observability: metrics.get(message._id),
      actions: [
        ...new Map(
          actions.get(message._id)!.map((action) => [action.id, action]),
        ).values(),
      ].sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order),
    }));
  });
}
