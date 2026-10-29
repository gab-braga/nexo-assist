import type { Ticket, TicketData, TicketPriority } from "@/types/tickets";

export function ticketPriority(
  data: Pick<TicketData, "impact" | "urgency">,
): TicketPriority {
  if (data.urgency === "blocked" && data.impact !== "person") return "critical";
  if (data.urgency === "blocked" || data.urgency === "today") return "high";
  return data.urgency === "workaround" ? "medium" : "low";
}

// Demonstration calendar: São Paulo (UTC-03), Mon–Fri 08:00–18:00, no holidays.
// One business day = ten working hours; critical tickets use elapsed time, 24/7.
export function ticketDeadline(from: Date, priority: TicketPriority): Date {
  if (priority === "critical") return new Date(from.getTime() + 3600000);
  let remaining =
    ({ high: 4, medium: 30, low: 50 } as const)[priority] * 3600000;
  const local = new Date(from.getTime() - 3 * 3600000);
  while (remaining > 0) {
    const start = new Date(local);
    start.setUTCHours(8, 0, 0, 0);
    const end = new Date(local);
    end.setUTCHours(18, 0, 0, 0);
    if (local.getUTCDay() === 0 || local.getUTCDay() === 6 || local >= end) {
      local.setUTCDate(local.getUTCDate() + 1);
      local.setUTCHours(8, 0, 0, 0);
      continue;
    }
    if (local < start) local.setTime(start.getTime());
    const used = Math.min(remaining, end.getTime() - local.getTime());
    local.setTime(local.getTime() + used);
    remaining -= used;
  }
  return new Date(local.getTime() + 3 * 3600000);
}

export function canReopen(
  ticket: Pick<Ticket, "status" | "resolvedAt">,
  now: Date,
) {
  const age = ticket.resolvedAt
    ? now.getTime() - ticket.resolvedAt.getTime()
    : -1;
  return ticket.status === "resolved" && age >= 0 && age <= 7 * 86400000;
}

export function normalizeProblem(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function similarProblem(a: TicketData, b: TicketData) {
  if (a.category !== b.category || a.type !== b.type) return false;
  const first = new Set(
    normalizeProblem(a.title)
      .split(" ")
      .filter((word) => word.length > 2),
  );
  const second = new Set(
    normalizeProblem(b.title)
      .split(" ")
      .filter((word) => word.length > 2),
  );
  const intersection = [...first].filter((word) => second.has(word)).length;
  return (
    normalizeProblem(a.title) === normalizeProblem(b.title) ||
    intersection / Math.max(1, new Set([...first, ...second]).size) >= 0.6
  );
}
