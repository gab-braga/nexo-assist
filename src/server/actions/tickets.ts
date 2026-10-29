"use server";

import { result } from "@/server/lib/errors";
import { ticketService } from "@/server/services/tickets";

export async function listMyTickets(input: unknown = {}) {
  return result(() => ticketService.listMyTickets(input));
}

export async function listAdministrativeTickets(input: unknown = {}) {
  return result(() => ticketService.listAdministrativeTickets(input));
}

export async function getTicket(input: unknown) {
  return result(() => ticketService.getTicket(input));
}

export async function getTicketHistory(input: unknown) {
  return result(() => ticketService.getTicketHistory(input));
}

export async function findPossibleDuplicates(input: unknown) {
  return result(() => ticketService.findPossibleDuplicates(input));
}

export async function prepareTicketChange(input: unknown) {
  return result(() => ticketService.prepareTicketChange(input));
}

// Keep this entry point separate from preparation so future model tools can be
// granted preparation only. The user confirms the exact persisted draft/token.
export async function confirmTicketChange(input: unknown) {
  return result(() => ticketService.confirmTicketChange(input));
}

export async function resolveTicket(input: unknown) {
  return result(() => ticketService.resolveTicket(input));
}
