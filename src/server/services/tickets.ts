import "server-only";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { Filter } from "mongodb";
import type { requireUser } from "@/auth/guards";
import { AppError } from "@/server/lib/errors";
import { checkTicketAvailability } from "@/server/lib/ticket-availability";
import {
  ticketRepository,
  type TicketRepository,
  type TicketTransaction,
} from "@/server/repositories/tickets";
import {
  AdminTicketListSchema,
  ConfirmTicketSchema,
  PrepareTicketSchema,
  ResolveTicketSchema,
  TicketDataSchema,
  TicketListSchema,
  ConversationDraftSchema,
} from "@/server/schemas/tickets";
import { IdSchema } from "@/server/schemas/uuid";
import {
  canReopen,
  similarProblem,
  ticketDeadline,
  ticketPriority,
} from "@/server/policies/tickets";
import type { SessionUser } from "@/types/domain";
import { canProcessAgent } from "@/auth/conversation-state";
import { buildHandoffSummary } from "@/server/policies/handoff";
import { prioritySla, operationNames } from "@/lib/ticket-display";
import type {
  Ticket,
  TicketData,
  TicketDTO,
  TicketDraft,
  ConversationInteraction,
} from "@/types/tickets";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function serialize(ticket: Ticket, now: Date): TicketDTO {
  return {
    ...ticket,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    lastServiceUpdateAt: ticket.lastServiceUpdateAt.toISOString(),
    nextResponseDueAt: ticket.nextResponseDueAt.toISOString(),
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    overdue: ticket.status !== "resolved" && ticket.nextResponseDueAt < now,
  };
}

function own(
  user: SessionUser,
  ticket: Ticket | null,
): asserts ticket is Ticket {
  if (!ticket || ticket.customerId !== user.uid)
    throw new AppError("NOT_FOUND", "Chamado não encontrado.");
}

function versionMatches(ticket: Ticket, expected: number | undefined | null) {
  if (ticket.version !== expected)
    throw new AppError(
      "CONFLICT",
      "O chamado foi alterado. Prepare uma nova operação.",
    );
}

function validateOperation(
  ticket: Ticket,
  operation: TicketDraft["operation"],
  now: Date,
) {
  if (operation === "reopen") {
    if (!canReopen(ticket, now))
      throw new AppError(
        "REOPEN_WINDOW_EXPIRED",
        "Somente chamados resolvidos há até sete dias podem ser reabertos.",
      );
  } else if (ticket.status === "resolved") {
    throw new AppError(
      "INVALID_OPERATION",
      "Reabra o chamado antes de alterá-lo.",
    );
  }
}

// Dependencies are server-only composition points, not request parameters.
// Production never accepts ActorContext/user IDs from clients or model tools.
export function createTicketService(deps: {
  repository: TicketRepository;
  authenticate: typeof requireUser;
  now: () => Date;
  available: () => void;
}) {
  const { repository: repo, authenticate, now, available } = deps;
  async function boundConversation(
    tx: TicketTransaction,
    user: SessionUser,
    id: string,
    runId?: string,
    controlVersion?: number,
  ) {
    const conversation = await tx.getConversation(id);
    if (!conversation || conversation.customerId !== user.uid)
      throw new AppError("NOT_FOUND", "Conversa não encontrada.");
    if (
      !canProcessAgent(conversation) ||
      (controlVersion !== undefined &&
        (conversation.aiControlVersion ?? 0) !== controlVersion)
    )
      throw new AppError(
        "HUMAN_CONTROL",
        "A conversa está encerrada ou com atendimento humano.",
      );
    if (runId) {
      const run = await tx.getRun(runId);
      if (
        !run ||
        run.customerId !== user.uid ||
        run.conversationId !== id ||
        run.state !== "running" ||
        run.expiresAt <= now() ||
        conversation.aiActiveRunId !== runId ||
        (conversation.aiControlVersion ?? 0) !== run.controlVersion
      )
        throw new AppError("CONFLICT", "A execução não está mais ativa.");
    } else if (conversation.aiActiveRunId)
      throw new AppError(
        "RUN_IN_PROGRESS",
        "Aguarde o processamento da mensagem antes de confirmar.",
      );
    return conversation;
  }
  async function list(input: unknown = {}, admin = false) {
    const user = await authenticate(admin ? "agent" : "chat");
    const query = admin
      ? AdminTicketListSchema.parse(input)
      : TicketListSchema.parse(input);
    available();
    const filter: Filter<Ticket> = {};
    if (!admin) filter.customerId = user.uid;
    else if ("customerId" in query && typeof query.customerId === "string")
      filter.customerId = query.customerId;
    if (query.status) filter.status = query.status;
    if (query.overdue) {
      if (query.status === "resolved") return { items: [], nextCursor: null };
      filter.status = query.status ?? { $ne: "resolved" };
      filter.nextResponseDueAt = { $lt: now() };
    }
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { title: { $regex: escaped, $options: "i" } },
        { number: { $regex: escaped, $options: "i" } },
      ];
    }
    if (query.cursor)
      filter.$and = [
        {
          $or: [
            { updatedAt: { $lt: new Date(query.cursor.date) } },
            {
              updatedAt: new Date(query.cursor.date),
              _id: { $lt: query.cursor.id },
            },
          ],
        },
      ];
    const rows = await repo.list(filter, query.limit + 1);
    const items = rows
      .slice(0, query.limit)
      .map((ticket) => serialize(ticket, now()));
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > query.limit && last
          ? { date: last.updatedAt, id: last._id }
          : null,
    };
  }

  async function get(input: unknown) {
    const user = await authenticate();
    const id = IdSchema.parse(input);
    available();
    const ticket = await repo.getTicket(id);
    if (user.role === "chat") own(user, ticket);
    if (!ticket) throw new AppError("NOT_FOUND", "Chamado não encontrado.");
    return serialize(ticket, now());
  }

  async function confirmTicket(
    query: { draftId: string; digest: string; token?: string },
    conversationId?: string,
  ): Promise<TicketDTO> {
    const user = await authenticate("chat");
    available();
    const result = await repo.transaction(async (tx) => {
      await tx.lockCustomer(user.uid);
      const draft = await tx.getDraft(query.draftId);
      if (!draft || draft.customerId !== user.uid)
        throw new AppError("NOT_FOUND", "Confirmação não encontrada.");
      if (conversationId && draft.conversationId !== conversationId)
        throw new AppError(
          "INVALID_CONFIRMATION",
          "O rascunho não pertence a esta conversa.",
        );
      if (
        draft.digest !== query.digest ||
        (!conversationId &&
          (!query.token ||
            !timingSafeEqual(
              Buffer.from(draft.tokenHash, "hex"),
              Buffer.from(hash(query.token), "hex"),
            )))
      )
        throw new AppError(
          "INVALID_CONFIRMATION",
          "Confirmação inválida. Prepare novamente.",
        );
      if (draft.appliedAt && draft.result) return draft.result;
      if (draft.cancelledAt)
        throw new AppError(
          "CONFIRMATION_CANCELLED",
          "Este rascunho foi cancelado ou substituído. Revise o rascunho atual.",
        );
      const conversation = draft.conversationId
        ? await boundConversation(
            tx,
            user,
            draft.conversationId,
            undefined,
            draft.controlVersion,
          )
        : null;
      if (conversation && conversation.pendingDraftId !== draft._id)
        throw new AppError(
          "INVALID_CONFIRMATION",
          "Este não é o rascunho atual.",
        );
      const timestamp = now();
      if (draft.expiresAt <= timestamp)
        throw new AppError(
          "CONFIRMATION_EXPIRED",
          "Confirmação expirada. Prepare novamente.",
        );
      const before =
        draft.operation === "create"
          ? null
          : await tx.getTicket(draft.ticketId);
      if (draft.operation !== "create") {
        own(user, before);
        versionMatches(before, draft.expectedVersion);
        validateOperation(before, draft.operation, timestamp);
      }
      if (draft.operation !== "handoff") {
        const duplicates = (
          await tx.candidates(
            user.uid,
            draft.conversationId && draft.operation === "create"
              ? new Date(timestamp.getTime() - 7 * 86400000)
              : undefined,
          )
        ).filter(
          (ticket) =>
            ticket._id !== draft.ticketId && similarProblem(ticket, draft.data),
        );
        if (duplicates.length)
          throw new AppError(
            "DUPLICATE_TICKET",
            "Já existe chamado aberto para este problema. Consulte os candidatos e confirme uma atualização.",
          );
      }
      const priority = ticketPriority(draft.data);
      const ticket: Ticket = {
        ...draft.data,
        _id: draft.ticketId,
        number:
          before && before.type === draft.data.type
            ? before.number
            : `${draft.data.type}-${draft.ticketId.toUpperCase()}`,
        customerId: user.uid,
        customerName: draft.customerName,
        priority,
        status:
          draft.operation === "handoff"
            ? "waiting_human"
            : before && draft.operation === "update"
              ? before.status
              : "open",
        createdAt: before?.createdAt ?? timestamp,
        updatedAt: timestamp,
        // Employee messages/edits never reset the service response deadline.
        lastServiceUpdateAt:
          draft.operation === "reopen"
            ? timestamp
            : (before?.lastServiceUpdateAt ?? timestamp),
        nextResponseDueAt:
          !before || draft.operation === "reopen"
            ? ticketDeadline(timestamp, priority)
            : ticketDeadline(before.lastServiceUpdateAt, priority),
        resolvedAt: null,
        version: (before?.version ?? -1) + 1,
      };
      if (before) await tx.saveTicket(ticket, before.version);
      else await tx.insertTicket(ticket);
      await tx.insertEvent({
        _id: draft._id,
        ticketId: ticket._id,
        actorId: user.uid,
        operation: draft.operation,
        reason: draft.reason,
        before,
        after: ticket,
        createdAt: timestamp,
      });
      await tx.saveDraft({ ...draft, appliedAt: timestamp, result: ticket });
      if (conversation) {
        const escalate =
          priority === "critical" ||
          ticket.status === "waiting_human" ||
          ticket.nextResponseDueAt < timestamp;
        const response = serialize(ticket, timestamp);
        await tx.insertMessage({
          _id: draft.confirmationMessageId!,
          conversationId: conversation._id,
          authorId: "nexo-assist",
          authorName: "Nexo Assist",
          role: "assistant",
          text: `${operationNames[draft.operation]} confirmada: ${ticket.number}. ${escalate ? "A conversa foi encaminhada à fila humana." : "Os dados foram salvos."}`,
          createdAt: timestamp,
          sequence: conversation.version + 1,
          processingState: "completed",
          ticket: response,
        });
        await tx.insertConversationEvent({
          _id: randomUUID(),
          conversationId: conversation._id,
          actorId: user.uid,
          operation: "ticket_confirmed",
          messageId: draft.confirmationMessageId,
          draftId: draft._id,
          digest: draft.digest,
          createdAt: timestamp,
        });
        if (escalate)
          await tx.insertConversationEvent({
            _id: randomUUID(),
            conversationId: conversation._id,
            actorId: user.uid,
            operation: "request_human",
            messageId: draft.confirmationMessageId,
            reason:
              priority === "critical"
                ? "critical"
                : ticket.status === "waiting_human"
                  ? "requested"
                  : "overdue",
            summary: `${ticket.number}: ${ticket.title}. Prioridade: ${priority}.`,
            previousState: "AGENT_ACTIVE",
            newState: "WAITING_FOR_ANALYST",
            outcome: "success",
            createdAt: timestamp,
          });
        await tx.saveConversation(
          {
            ...conversation,
            selectedTicketId: ticket._id,
            flow: { intent: draft.operation, stage: "idle" },
            ...(escalate
              ? {
                  aiHandoff: true,
                  aiControlVersion: (conversation.aiControlVersion ?? 0) + 1,
                  handoff: {
                    id: draft._id,
                    requestedAt: timestamp.toISOString(),
                    reason:
                      priority === "critical"
                        ? ("critical" as const)
                        : ticket.status === "waiting_human"
                          ? ("requested" as const)
                          : ("overdue" as const),
                    summary: {
                      ...buildHandoffSummary(
                        { ...conversation, pendingDraftId: null },
                        `${ticket.number}: ${ticket.title}`,
                        [],
                        [response],
                      ),
                      operations: [
                        `${operationNames[draft.operation]} confirmada: ${ticket.number}`,
                      ],
                    },
                  },
                }
              : {}),
            version: conversation.version + 1,
            updatedAt: timestamp,
          },
          conversation.version,
        );
      }
      return ticket;
    });
    return serialize(result, now());
  }

  const service = {
    listMyTickets: (input: unknown = {}) => list(input),
    listAdministrativeTickets: (input: unknown = {}) => list(input, true),
    getTicket: get,
    async getTicketHistory(input: unknown) {
      const ticket = await get(input); // authorization lives in the service
      return (await repo.events(ticket._id)).map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
        before: event.before ? serialize(event.before, now()) : null,
        after: serialize(event.after, now()),
      }));
    },
    async findPossibleDuplicates(input: unknown) {
      const user = await authenticate("chat");
      const data = TicketDataSchema.parse(input);
      available();
      // Deliberately includes all open candidates; UI pagination must not hide duplicates.
      const candidates = await repo.transaction((tx) =>
        tx.candidates(user.uid, new Date(now().getTime() - 7 * 86400000)),
      );
      return candidates
        .filter((ticket) => similarProblem(ticket, data))
        .map((ticket) => serialize(ticket, now()));
    },
    async prepareTicketChange(
      input: unknown,
      binding?: { conversationId: string; runId: string },
    ) {
      const user = await authenticate("chat");
      const query = PrepareTicketSchema.parse(input);
      available();
      const token = randomBytes(32).toString("hex");
      const timestamp = now();
      const draft = await repo.transaction(async (tx) => {
        const conversation = binding
          ? await boundConversation(
              tx,
              user,
              binding.conversationId,
              binding.runId,
            )
          : null;
        if (conversation?.pendingDraftId) {
          const current = await tx.getDraft(conversation.pendingDraftId);
          if (
            current &&
            binding &&
            current.sourceRunId === binding.runId &&
            !current.cancelledAt &&
            !current.appliedAt
          )
            throw new AppError(
              "DRAFT_ALREADY_PREPARED",
              "Já existe uma proposta neste turno. Aguarde o funcionário revisar.",
            );
        }
        const existing = query.ticketId
          ? await tx.getTicket(query.ticketId)
          : null;
        if (query.operation !== "create") {
          own(user, existing);
          versionMatches(existing, query.version);
          validateOperation(existing, query.operation, timestamp);
        }
        let data: TicketData = TicketDataSchema.parse(
          query.data ??
            (existing && {
              title: existing.title,
              description: existing.description,
              type: existing.type,
              category: existing.category,
              impact: existing.impact,
              urgency: existing.urgency,
            }),
        );
        if (
          binding &&
          existing &&
          query.operation === "update" &&
          !data.description.includes(existing.description)
        )
          data = TicketDataSchema.parse({
            ...data,
            description: `${existing.description}\n\nComplemento:\n${data.description}`,
          });
        if (binding && query.operation === "create") {
          const duplicates = (
            await tx.candidates(
              user.uid,
              new Date(timestamp.getTime() - 7 * 86400000),
            )
          ).filter((ticket) => similarProblem(ticket, data));
          if (duplicates.length)
            throw new AppError(
              "DUPLICATE_TICKET",
              "Há chamados semelhantes. Consulte os candidatos e selecione atualização ou reabertura.",
            );
        }
        const payload = {
          operation: query.operation,
          ticketId: existing?._id ?? randomUUID(),
          expectedVersion: existing?.version ?? null,
          data,
          reason: query.reason ?? null,
        };
        const record: TicketDraft = {
          _id: randomUUID(),
          customerId: user.uid,
          customerName: user.name,
          ...payload,
          digest: hash(JSON.stringify(payload)),
          tokenHash: hash(token),
          createdAt: timestamp,
          expiresAt: new Date(timestamp.getTime() + 30 * 60000),
          appliedAt: null,
          result: null,
          ...(conversation && binding
            ? {
                conversationId: conversation._id,
                sourceRunId: binding.runId,
                controlVersion: conversation.aiControlVersion ?? 0,
                confirmationMessageId: randomUUID(),
                cancelledAt: null,
              }
            : {}),
        };
        if (conversation) {
          if (conversation.pendingDraftId) {
            const previous = await tx.getDraft(conversation.pendingDraftId);
            if (
              previous &&
              previous.customerId === user.uid &&
              !previous.appliedAt &&
              !previous.cancelledAt
            )
              await tx.saveDraft({ ...previous, cancelledAt: timestamp });
          }
          await tx.saveConversation(
            {
              ...conversation,
              pendingDraftId: record._id,
              ...(existing ? { selectedTicketId: existing._id } : {}),
              flow: {
                intent: query.operation,
                stage: "awaiting_confirmation",
                data,
              },
              version: conversation.version + 1,
              updatedAt: timestamp,
            },
            conversation.version,
          );
          await tx.insertConversationEvent({
            _id: randomUUID(),
            conversationId: conversation._id,
            actorId: user.uid,
            operation: "draft_prepared",
            draftId: record._id,
            createdAt: timestamp,
          });
        }
        await tx.insertDraft(record);
        return record;
      });
      return {
        draftId: draft._id,
        digest: draft.digest,
        token,
        operation: draft.operation,
        ticketId: draft.ticketId,
        expectedVersion: draft.expectedVersion,
        data: draft.data,
        priority: ticketPriority(draft.data),
        affectedEmployee: { id: user.uid, name: user.name },
        reason: draft.reason,
        expiresAt: draft.expiresAt.toISOString(),
        sla: prioritySla[ticketPriority(draft.data)],
      };
    },
    async confirmTicketChange(input: unknown) {
      return confirmTicket(ConfirmTicketSchema.parse(input));
    },
    async confirmConversationDraft(input: unknown): Promise<TicketDTO> {
      const query = ConversationDraftSchema.parse(input);
      // Only this authenticated Server Action path supplies the binding. No model tool receives it.
      return confirmTicket(query, query.conversationId);
    },
    async cancelConversationDraft(input: unknown, runId?: string) {
      const user = await authenticate("chat");
      const query = ConversationDraftSchema.parse(input);
      available();
      await repo.transaction(async (tx) => {
        const draft = await tx.getDraft(query.draftId);
        if (
          !draft ||
          draft.customerId !== user.uid ||
          draft.conversationId !== query.conversationId
        )
          throw new AppError("NOT_FOUND", "Rascunho não encontrado.");
        if (draft.digest !== query.digest || draft.appliedAt)
          throw new AppError(
            "INVALID_CONFIRMATION",
            "A operação já foi aplicada ou o rascunho mudou.",
          );
        if (draft.cancelledAt) return;
        const conversation = await boundConversation(
          tx,
          user,
          query.conversationId,
          runId,
        );
        if (conversation.pendingDraftId !== draft._id)
          throw new AppError("CONFLICT", "O rascunho atual mudou.");
        const timestamp = now();
        await tx.saveDraft({ ...draft, cancelledAt: timestamp });
        await tx.saveConversation(
          {
            ...conversation,
            pendingDraftId: null,
            flow: { intent: "clarify", stage: "idle" },
            version: conversation.version + 1,
            updatedAt: timestamp,
          },
          conversation.version,
        );
        await tx.insertConversationEvent({
          _id: randomUUID(),
          conversationId: conversation._id,
          actorId: user.uid,
          operation: "draft_cancelled",
          draftId: draft._id,
          createdAt: timestamp,
        });
      });
    },
    async cancelPendingOperation(
      conversationId: string,
      runId: string,
    ): Promise<{ cancelled: boolean }> {
      const panel = await service.getConversationInteraction(conversationId);
      if (!panel.draft || panel.draft.state === "applied")
        return { cancelled: false };
      await service.cancelConversationDraft(
        {
          conversationId,
          draftId: panel.draft.draftId,
          digest: panel.draft.digest,
        },
        runId,
      );
      return { cancelled: true };
    },
    async getConversationInteraction(
      input: unknown,
    ): Promise<ConversationInteraction> {
      const user = await authenticate("chat");
      const id = IdSchema.parse(input);
      available();
      return repo.transaction(async (tx) => {
        const conversation = await tx.getConversation(id);
        if (!conversation || conversation.customerId !== user.uid)
          throw new AppError("NOT_FOUND", "Conversa não encontrada.");
        const draft = conversation.pendingDraftId
          ? await tx.getDraft(conversation.pendingDraftId)
          : null;
        const safeDraft =
          draft && draft.customerId === user.uid && draft.conversationId === id
            ? draft
            : null;
        const tickets: TicketDTO[] = [];
        for (const ticketId of conversation.flow?.ticketIds?.slice(0, 5) ??
          []) {
          const ticket = await tx.getTicket(ticketId);
          if (ticket?.customerId === user.uid)
            tickets.push(serialize(ticket, now()));
        }
        const selected = conversation.selectedTicketId
          ? await tx.getTicket(conversation.selectedTicketId)
          : null;
        return {
          canConfirm:
            canProcessAgent(conversation) &&
            !conversation.aiActiveRunId &&
            !!safeDraft &&
            (conversation.aiControlVersion ?? 0) === safeDraft.controlVersion,
          flow: conversation.flow ?? null,
          tickets,
          selectedTicket:
            selected?.customerId === user.uid
              ? serialize(selected, now())
              : null,
          draft: safeDraft
            ? {
                draftId: safeDraft._id,
                digest: safeDraft.digest,
                operation: safeDraft.operation,
                data: safeDraft.data,
                priority: ticketPriority(safeDraft.data),
                affectedEmployee: safeDraft.customerName,
                reason: safeDraft.reason,
                expiresAt: safeDraft.expiresAt.toISOString(),
                state: safeDraft.appliedAt
                  ? "applied"
                  : safeDraft.cancelledAt
                    ? "cancelled"
                    : safeDraft.expiresAt <= now()
                      ? "expired"
                      : "pending",
              }
            : null,
        };
      });
    },
    async resolveTicket(input: unknown) {
      const user = await authenticate("agent");
      const query = ResolveTicketSchema.parse(input);
      available();
      const ticket = await repo.transaction(async (tx) => {
        const before = await tx.getTicket(query.ticketId);
        if (!before) throw new AppError("NOT_FOUND", "Chamado não encontrado.");
        await tx.lockCustomer(before.customerId);
        versionMatches(before, query.version);
        if (before.status === "resolved")
          throw new AppError(
            "INVALID_OPERATION",
            "O chamado já foi resolvido.",
          );
        const timestamp = now();
        const after: Ticket = {
          ...before,
          status: "resolved",
          resolvedAt: timestamp,
          updatedAt: timestamp,
          lastServiceUpdateAt: timestamp,
          version: before.version + 1,
        };
        await tx.saveTicket(after, before.version);
        await tx.insertEvent({
          _id: randomUUID(),
          ticketId: after._id,
          actorId: user.uid,
          operation: "resolve",
          reason: query.reason,
          before,
          after,
          createdAt: timestamp,
        });
        return after;
      });
      return serialize(ticket, now());
    },
  };
  return service;
}

export const ticketService = createTicketService({
  repository: ticketRepository,
  authenticate: async (role) =>
    (await import("@/auth/guards")).requireUser(role),
  now: () => new Date(),
  available: checkTicketAvailability,
});
