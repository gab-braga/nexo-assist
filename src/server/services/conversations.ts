import "server-only";
import type { Filter } from "mongodb";
import { requireUser } from "@/auth/guards";
import { canReadConversation, canSendMessage } from "@/auth/policy";
import { AppError } from "@/server/lib/errors";
import {
  appendMessage,
  applyConversationTransition,
  findConversation,
  findConversations,
  findMessages,
} from "@/server/repositories/conversations";
import {
  HistorySchema,
  ListSchema,
  MessageSchema,
  TransitionSchema,
  AnalystContextSchema,
  HumanSupportSchema,
  CustomerHistorySchema,
} from "@/server/schemas/conversations";
import type {
  Conversation,
  ConversationDTO,
  MessageDTO,
  SessionUser,
} from "@/types/domain";
import { IdSchema } from "@/server/schemas/uuid";
import { conversationState, canProcessAgent } from "@/auth/conversation-state";
import { agentRunRepository } from "@/server/repositories/agent-runs";
import { messageHistoryFilter } from "@/server/policies/message-history";
import { ticketService } from "./tickets";
import { transferToHuman } from "@/server/repositories/handoff";

function checkAccess(
  user: SessionUser,
  conversation: Conversation | null,
): asserts conversation is Conversation {
  if (!conversation || !canReadConversation(user, conversation)) {
    throw new AppError("NOT_FOUND", "Atendimento não encontrado.");
  }
}

function serialize(conversation: Conversation): ConversationDTO {
  return {
    ...conversation,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    operationalState: conversationState(conversation),
  };
}

async function readConversation(user: SessionUser, id: string) {
  let conversation = await findConversation(id);
  checkAccess(user, conversation);
  if (
    conversation.aiActiveRunId &&
    (await agentRunRepository.recover(id, conversation.customerId))
  ) {
    conversation = await findConversation(id);
    checkAccess(user, conversation);
  }
  return conversation;
}

export async function listConversations(input: unknown = {}) {
  const user = await requireUser();
  const query = ListSchema.parse(input);
  const filter: Filter<Conversation> = {};
  if (user.role === "chat") filter.customerId = user.uid;
  if (query.status === "mine") {
    if (user.role !== "agent")
      throw new AppError("FORBIDDEN", "Filtro não permitido.");
    filter.agentId = user.uid;
  } else if (query.status === "ai") {
    filter.status = "waiting";
    filter.aiEnabled = true;
    filter.aiHandoff = { $ne: true };
    filter.agentId = null;
  } else if (query.status !== "all") filter.status = query.status;
  if (user.role === "agent" && query.status === "waiting") {
    filter.agentId = null;
    filter.$and = [
      { $or: [{ aiEnabled: { $ne: true } }, { aiHandoff: true }] },
    ];
  }
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { subject: { $regex: escaped, $options: "i" } },
      { customerName: { $regex: escaped, $options: "i" } },
    ];
  }
  if (query.cursor) {
    filter.$and = [
      ...(filter.$and ?? []),
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
  }
  const rows = await findConversations(filter, query.limit + 1);
  const more = rows.length > query.limit;
  const items = rows.slice(0, query.limit).map(serialize);
  const last = items.at(-1);
  return {
    items,
    nextCursor: more && last ? { date: last.updatedAt, id: last._id } : null,
  };
}

export async function getConversation(input: unknown) {
  const user = await requireUser();
  const conversation = await readConversation(user, IdSchema.parse(input));
  return serialize(conversation);
}

export async function listCustomerHistory(input: unknown = {}) {
  await requireUser("chat");
  const query = CustomerHistorySchema.parse(input);
  const page = await listConversations(query);
  const items = await Promise.all(
    page.items.map(async (conversation) => {
      const [last] = await findMessages(
        { conversationId: conversation._id },
        1,
      );
      return {
        _id: conversation._id,
        subject: conversation.subject,
        updatedAt: conversation.updatedAt,
        operationalState: conversationState(conversation),
        lastMessagePreview: last
          ? Array.from(last.text.replace(/\s+/g, " ").trim())
              .slice(0, 180)
              .join("")
          : null,
      };
    }),
  );
  return { items, nextCursor: page.nextCursor };
}

export async function getMessages(input: unknown) {
  const user = await requireUser();
  const query = HistorySchema.parse(input);
  const conversation = await readConversation(user, query.conversationId);
  const filter = messageHistoryFilter(query.conversationId, query.cursor);
  const rows = await findMessages(filter, 51);
  const items: MessageDTO[] = rows
    .slice(0, 50)
    .map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  const last = items.at(-1);
  return {
    conversation: serialize(conversation),
    items: items.reverse(),
    nextCursor:
      rows.length > 50 && last
        ? {
            date: last.createdAt,
            id: last._id,
            ...(last.sequence !== undefined ? { sequence: last.sequence } : {}),
          }
        : null,
  };
}

export async function sendMessage(input: unknown) {
  const user = await requireUser();
  const data = MessageSchema.parse(input);
  await appendMessage(
    {
      _id: data.requestId,
      conversationId: data.conversationId,
      authorId: user.uid,
      authorName: user.name,
      role: user.role,
      text: data.text,
      createdAt: new Date(),
    },
    (conversation, existing) => {
      checkAccess(user, conversation);
      if (existing) {
        if (
          existing.authorId !== user.uid ||
          existing.conversationId !== data.conversationId ||
          existing.text !== data.text
        ) {
          throw new AppError(
            "CONFLICT",
            "Identificador de mensagem já utilizado.",
          );
        }
        return;
      }
      if (conversation.status === "closed")
        throw new AppError("CONFLICT", "Este atendimento foi encerrado.");
      if (user.role === "chat" && canProcessAgent(conversation))
        throw new AppError(
          "INVALID_OPERATION",
          "Envie a mensagem pelo assistente para preservar o processamento e o limite da sessão.",
        );
      if (!canSendMessage(user, conversation))
        throw new AppError(
          "FORBIDDEN",
          "Assuma o atendimento antes de responder.",
        );
    },
  );
}

export async function transitionConversation(input: unknown) {
  const user = await requireUser("agent");
  const data = TransitionSchema.parse(input);
  await applyConversationTransition(user, data);
}

export async function getAnalystContext(input: unknown) {
  const user = await requireUser("agent");
  const query = AnalystContextSchema.parse(
    typeof input === "string" ? { conversationId: input } : input,
  );
  const conversation = await readConversation(user, query.conversationId);
  const tickets = await ticketService.listAdministrativeTickets({
    customerId: conversation.customerId,
    cursor: query.cursor,
    limit: 10,
  });
  return { tickets: tickets.items, nextCursor: tickets.nextCursor };
}

export async function requestHumanSupport(input: unknown) {
  const user = await requireUser("chat");
  const query = HumanSupportSchema.parse(input);
  await transferToHuman({
    ...query,
    customerId: user.uid,
    reason: "requested",
    summary:
      "Solicitação explícita de atendimento humano pelo funcionário no chat.",
  });
}
