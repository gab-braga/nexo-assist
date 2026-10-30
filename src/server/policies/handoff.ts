import type {
  Conversation,
  HandoffSummary,
  Message,
  SessionUser,
} from "@/types/domain";
import type { TicketDTO } from "@/types/tickets";
import { AppError } from "@/server/lib/errors";
import { conversationState } from "@/auth/conversation-state";

export const handoffNotice =
  "Sua conversa foi encaminhada à fila de atendimento humano. O Nexo Assist está pausado enquanto você aguarda um analista.";

export const handoffReasonNames = {
  requested: "Solicitação do funcionário",
  critical: "Incidente crítico",
  overdue: "Prazo de resposta vencido",
  uncertain: "Necessidade de análise humana",
};

export function summaryText(text: string, max = 500) {
  return text
    .replace(
      /\b(senha|password|token|api[_-]?key|authorization)\s*[:=]\s*(?:Bearer\s+)?\S+/gi,
      "$1: [omitido]",
    )
    .slice(0, max);
}

export function buildHandoffSummary(
  conversation: Conversation,
  note: string,
  messages: Message[] = [],
  tickets: TicketDTO[] = [],
): HandoffSummary {
  const own = messages.filter(
    (message) => message.conversationId === conversation._id,
  );
  return {
    problem: summaryText(
      conversation.flow?.data?.description ??
        own.find((message) => message._id === conversation.initialMessageId)
          ?.text ??
        conversation.subject,
    ),
    information: own
      .filter((message) => message.role === "chat")
      .slice(-3)
      .map((message) => summaryText(message.text)),
    relatedTickets: tickets
      .filter((ticket) => ticket.customerId === conversation.customerId)
      .slice(0, 5)
      .map((ticket) => ({
        id: ticket._id,
        number: ticket.number,
        title: summaryText(ticket.title, 160),
        status: ticket.status,
      })),
    guidance: own
      .filter((message) => message.role === "assistant" && !message.ticket)
      .slice(-3)
      .map((message) => summaryText(message.text)),
    operations: own
      .filter(
        (message) => message.ticket?.customerId === conversation.customerId,
      )
      .slice(-3)
      .map((message) => summaryText(message.text)),
    pending: conversation.pendingDraftId
      ? [
          "Existe uma proposta pendente. Ela será invalidada; operações exigem uma nova revisão e confirmação.",
        ]
      : [],
    agentNote: summaryText(note, 1000),
  };
}

export type AnalystOperation = "assume" | "release" | "return_to_ai" | "close";

export function analystTransition(
  user: SessionUser,
  conversation: Conversation,
  operation: AnalystOperation,
): Partial<Conversation> {
  if (user.role !== "agent")
    throw new AppError(
      "FORBIDDEN",
      "Somente analistas podem alterar o atendimento.",
    );
  if (operation === "assume") {
    // Preserve the existing explicit analyst takeover of an AI conversation.
    if (conversation.status !== "waiting" || conversation.agentId)
      throw new AppError(
        "CONFLICT",
        "A conversa já foi assumida ou encerrada.",
      );
    return {
      status: "active",
      agentId: user.uid,
      agentName: user.name,
      assignedAt: new Date().toISOString(),
    };
  }
  if (
    conversationState(conversation) !== "ANALYST_ACTIVE" ||
    conversation.agentId !== user.uid
  )
    throw new AppError(
      "FORBIDDEN",
      "Somente o analista responsável pode devolver ou encerrar este atendimento.",
    );
  if (operation === "close")
    return { status: "closed", closedAt: new Date().toISOString() };
  if (operation === "return_to_ai")
    return {
      status: "waiting",
      agentId: null,
      agentName: null,
      aiEnabled: true,
      aiHandoff: false,
      returnedAt: new Date().toISOString(),
    };
  return { status: "waiting", agentId: null, agentName: null, aiHandoff: true };
}
