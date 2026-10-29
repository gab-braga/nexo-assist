import "server-only";
import type { Filter, Db, ClientSession } from "mongodb";
import { database } from "@/server/lib/mongodb";
import { AppError } from "@/server/lib/errors";
import { ticketBackend } from "@/server/lib/ticket-availability";
import type { Ticket, TicketDraft, TicketEvent } from "@/types/tickets";
import type { Conversation, Message } from "@/types/domain";
import type { AgentRun } from "@/types/ai";
import { ticketDeadline } from "@/server/policies/tickets";

/** The already-authorized human reply and service update share one transaction. */
export async function recordHumanServiceResponse(
  db: Db,
  conversation: Conversation,
  message: Message,
  session: ClientSession,
) {
  if (message.role !== "agent" || !conversation.selectedTicketId) return;
  if (
    conversation.status !== "active" ||
    conversation.agentId !== message.authorId
  )
    throw new AppError(
      "FORBIDDEN",
      "Somente o analista responsável pode atualizar o atendimento.",
    );
  const tickets = db.collection<Ticket>("tickets");
  const before = await tickets.findOne(
    { _id: conversation.selectedTicketId, customerId: conversation.customerId },
    { session },
  );
  if (!before)
    throw new AppError("NOT_FOUND", "Chamado vinculado não encontrado.");
  if (before.status === "resolved") return;
  const after: Ticket = {
    ...before,
    lastServiceUpdateAt: message.createdAt,
    updatedAt: message.createdAt,
    nextResponseDueAt: ticketDeadline(message.createdAt, before.priority),
    version: before.version + 1,
  };
  const saved = await tickets.replaceOne(
    {
      _id: before._id,
      customerId: conversation.customerId,
      version: before.version,
    },
    after,
    { session },
  );
  if (saved.modifiedCount !== 1)
    throw new AppError(
      "CONFLICT",
      "O chamado mudou. Atualize e tente novamente.",
    );
  await db
    .collection<TicketEvent>("ticket_events")
    .insertOne(
      {
        _id: `response:${message._id}`,
        ticketId: before._id,
        actorId: message.authorId,
        operation: "service_update",
        reason: message.text,
        before,
        after,
        createdAt: message.createdAt,
      },
      { session },
    );
}

export interface TicketTransaction {
  getConversation(id: string): Promise<Conversation | null>;
  getRun(id: string): Promise<AgentRun | null>;
  saveConversation(conversation: Conversation, version: number): Promise<void>;
  insertMessage(message: Message): Promise<void>;
  insertConversationEvent(event: {
    _id: string;
    conversationId: string;
    actorId: string;
    operation: string;
    createdAt: Date;
    draftId?: string;
    reason?: string;
    summary?: string;
    previousState?: string;
    newState?: string;
    outcome?: string;
    messageId?: string;
    digest?: string;
  }): Promise<void>;
  lockCustomer(customerId: string): Promise<void>;
  getTicket(id: string): Promise<Ticket | null>;
  getDraft(id: string): Promise<TicketDraft | null>;
  candidates(customerId: string, resolvedSince?: Date): Promise<Ticket[]>;
  insertTicket(ticket: Ticket): Promise<void>;
  saveTicket(ticket: Ticket, version: number): Promise<void>;
  insertDraft(draft: TicketDraft): Promise<void>;
  saveDraft(draft: TicketDraft): Promise<void>;
  insertEvent(event: TicketEvent): Promise<void>;
}

export interface TicketRepository {
  transaction<T>(work: (tx: TicketTransaction) => Promise<T>): Promise<T>;
  getTicket(id: string): Promise<Ticket | null>;
  list(filter: Filter<Ticket>, limit: number): Promise<Ticket[]>;
  events(ticketId: string): Promise<TicketEvent[]>;
}

const mongoTickets: TicketRepository = {
  async getTicket(id) {
    return (await database())
      .collection<Ticket>("tickets")
      .findOne({ _id: id });
  },
  async list(filter, limit) {
    return (await database())
      .collection<Ticket>("tickets")
      .find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit)
      .toArray();
  },
  async events(ticketId) {
    return (await database())
      .collection<TicketEvent>("ticket_events")
      .find({ ticketId })
      .sort({ createdAt: 1, _id: 1 })
      .toArray();
  },
  async transaction(work) {
    const db = await database();
    const session = db.client.startSession();
    try {
      return await session.withTransaction(async () => {
        const tickets = db.collection<Ticket>("tickets");
        const drafts = db.collection<TicketDraft>("ticket_drafts");
        const tx: TicketTransaction = {
          getConversation: (id) =>
            db
              .collection<Conversation>("conversations")
              .findOne({ _id: id }, { session }),
          getRun: (id) =>
            db
              .collection<AgentRun>("agent_runs")
              .findOne({ _id: id }, { session }),
          async saveConversation(conversation, version) {
            const saved = await db
              .collection<Conversation>("conversations")
              .replaceOne({ _id: conversation._id, version }, conversation, {
                session,
              });
            if (saved.modifiedCount !== 1)
              throw new AppError(
                "CONFLICT",
                "A conversa mudou. Atualize e tente novamente.",
              );
          },
          async insertMessage(message) {
            await db
              .collection<Message>("messages")
              .insertOne(message, { session });
          },
          async insertConversationEvent(event) {
            await db
              .collection<
                Parameters<TicketTransaction["insertConversationEvent"]>[0]
              >("conversation_events")
              .insertOne(event, { session });
          },
          async lockCustomer(customerId) {
            // All ticket mutations contend on the same owner's document, even for
            // different draft IDs. Prevents write skew between duplicate checks.
            await db
              .collection<{
                _id: string;
                version: number;
              }>("ticket_customer_locks")
              .updateOne(
                { _id: customerId },
                { $inc: { version: 1 } },
                { upsert: true, session },
              );
          },
          getTicket: (id) => tickets.findOne({ _id: id }, { session }),
          getDraft: (id) => drafts.findOne({ _id: id }, { session }),
          candidates: (customerId, resolvedSince) =>
            tickets
              .find(
                {
                  customerId,
                  $or: [
                    { status: { $ne: "resolved" } },
                    ...(resolvedSince
                      ? [
                          {
                            status: "resolved" as const,
                            resolvedAt: { $gte: resolvedSince },
                          },
                        ]
                      : []),
                  ],
                },
                { session },
              )
              .toArray(),
          async insertTicket(ticket) {
            await tickets.insertOne(ticket, { session });
          },
          async saveTicket(ticket, version) {
            const saved = await tickets.replaceOne(
              { _id: ticket._id, version },
              ticket,
              { session },
            );
            if (saved.modifiedCount !== 1)
              throw new AppError(
                "CONFLICT",
                "O chamado foi alterado. Prepare uma nova operação.",
              );
          },
          async insertDraft(draft) {
            await drafts.insertOne(draft, { session });
          },
          async saveDraft(draft) {
            const saved = await drafts.replaceOne(
              { _id: draft._id, appliedAt: null },
              draft,
              { session },
            );
            if (saved.modifiedCount !== 1)
              throw new AppError("CONFLICT", "A confirmação já foi utilizada.");
          },
          async insertEvent(event) {
            await db
              .collection<TicketEvent>("ticket_events")
              .insertOne(event, { session });
          },
        };
        return work(tx);
      });
    } catch (error) {
      // Initial concurrent lock creation may fail as duplicate-key, not as a
      // retryable transaction error. Caller retries the SAME persisted draft.
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === 11000
      )
        throw new AppError(
          "CONFLICT",
          "Operação concorrente. Repita a mesma confirmação.",
        );
      throw error;
    } finally {
      await session.endSession();
    }
  },
};

export const ticketRepository: TicketRepository = {
  getTicket: (id) => ticketBackend(() => mongoTickets.getTicket(id)),
  list: (filter, limit) =>
    ticketBackend(() => mongoTickets.list(filter, limit)),
  events: (id) => ticketBackend(() => mongoTickets.events(id)),
  transaction: (work) => ticketBackend(() => mongoTickets.transaction(work)),
};
