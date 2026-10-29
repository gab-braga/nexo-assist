import type { Filter } from "mongodb";
import type {
  TicketRepository,
  TicketTransaction,
} from "../../src/server/repositories/tickets";
import type { Ticket, TicketDraft, TicketEvent } from "../../src/types/tickets";
import { AppError } from "../../src/server/lib/errors";
import type { Conversation, Message } from "../../src/types/domain";
import type { AgentRun } from "../../src/types/ai";

function matches(row: unknown, query: Record<string, unknown>): boolean {
  const record = row as Record<string, unknown>;
  return Object.entries(query).every(([key, value]) => {
    if (key === "$and")
      return (value as Record<string, unknown>[]).every((part) =>
        matches(row, part),
      );
    if (key === "$or")
      return (value as Record<string, unknown>[]).some((part) =>
        matches(row, part),
      );
    const actual = record[key];
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const op = value as {
        $ne?: unknown;
        $lt?: Date;
        $gte?: Date;
        $regex?: string;
        $options?: string;
      };
      if ("$ne" in op && actual === op.$ne) return false;
      if (op.$lt && !((actual as Date) < op.$lt)) return false;
      if (op.$gte && !((actual as Date) >= op.$gte)) return false;
      if (op.$regex && !new RegExp(op.$regex, op.$options).test(String(actual)))
        return false;
      return true;
    }
    return actual === value;
  });
}

// Transactional test double only; production always uses the existing database.
export class MemoryTickets implements TicketRepository {
  conversations = new Map<string, Conversation>();
  runs = new Map<string, AgentRun>();
  messages: Message[] = [];
  conversationEvents: Parameters<
    TicketTransaction["insertConversationEvent"]
  >[0][] = [];
  tickets = new Map<string, Ticket>();
  drafts = new Map<string, TicketDraft>();
  history: TicketEvent[] = [];
  failEvent = false;
  private queue: Promise<void> = Promise.resolve();
  async getTicket(id: string) {
    return structuredClone(this.tickets.get(id) ?? null);
  }
  async list(filter: Filter<Ticket>, limit: number) {
    return structuredClone(
      [...this.tickets.values()]
        .filter((row) => matches(row, filter))
        .sort(
          (a, b) =>
            b.updatedAt.getTime() - a.updatedAt.getTime() ||
            b._id.localeCompare(a._id),
        )
        .slice(0, limit),
    );
  }
  async events(id: string) {
    return structuredClone(
      this.history.filter((event) => event.ticketId === id),
    );
  }
  async transaction<T>(
    work: (tx: TicketTransaction) => Promise<T>,
  ): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    const tickets = structuredClone(this.tickets);
    const drafts = structuredClone(this.drafts);
    const history = structuredClone(this.history);
    const conversations = structuredClone(this.conversations);
    const messages = structuredClone(this.messages);
    const conversationEvents = structuredClone(this.conversationEvents);
    try {
      const result = await work({
        getConversation: async (id) =>
          structuredClone(conversations.get(id) ?? null),
        getRun: async (id) => structuredClone(this.runs.get(id) ?? null),
        saveConversation: async (conversation, version) => {
          if (conversations.get(conversation._id)?.version !== version)
            throw new AppError("CONFLICT", "stale conversation");
          conversations.set(conversation._id, structuredClone(conversation));
        },
        insertMessage: async (message) => {
          messages.push(structuredClone(message));
        },
        insertConversationEvent: async (event) => {
          conversationEvents.push(structuredClone(event));
        },
        lockCustomer: async () => {},
        getTicket: async (id) => structuredClone(tickets.get(id) ?? null),
        getDraft: async (id) => structuredClone(drafts.get(id) ?? null),
        candidates: async (owner, since) =>
          structuredClone(
            [...tickets.values()].filter(
              (ticket) =>
                ticket.customerId === owner &&
                (ticket.status !== "resolved" ||
                  (since && ticket.resolvedAt && ticket.resolvedAt >= since)),
            ),
          ),
        insertTicket: async (ticket) => {
          if (tickets.has(ticket._id))
            throw new AppError("CONFLICT", "duplicate ID");
          tickets.set(ticket._id, structuredClone(ticket));
        },
        saveTicket: async (ticket, version) => {
          if (tickets.get(ticket._id)?.version !== version)
            throw new AppError("CONFLICT", "stale");
          tickets.set(ticket._id, structuredClone(ticket));
        },
        insertDraft: async (draft) => {
          drafts.set(draft._id, structuredClone(draft));
        },
        saveDraft: async (draft) => {
          drafts.set(draft._id, structuredClone(draft));
        },
        insertEvent: async (event) => {
          if (this.failEvent) throw new Error("Injected event write failure");
          history.push(structuredClone(event));
        },
      });
      this.tickets = tickets;
      this.drafts = drafts;
      this.history = history;
      this.conversations = conversations;
      this.messages = messages;
      this.conversationEvents = conversationEvents;
      return result;
    } finally {
      release();
    }
  }
}
