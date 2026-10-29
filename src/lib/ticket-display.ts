import type { TicketPriority } from "@/types/tickets";

export const priorityNames: Record<TicketPriority, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};
export const prioritySla: Record<TicketPriority, string> = {
  critical: "1 hora",
  high: "4 horas úteis",
  medium: "3 dias úteis",
  low: "5 dias úteis",
};
export const operationNames = {
  create: "Abertura",
  update: "Atualização",
  reopen: "Reabertura",
  handoff: "Encaminhamento",
};
export const ticketStatusNames = {
  open: "Aberto",
  waiting_human: "Aguardando analista",
  resolved: "Resolvido",
};
