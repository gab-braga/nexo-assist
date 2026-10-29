import "server-only";
import type { Filter } from "mongodb";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/auth/guards";
import { canReadConversation, canSendMessage } from "@/auth/policy";
import { AppError } from "@/server/lib/errors";
import {
  appendMessage,
  transitionRecord,
  findConversation,
  findConversations,
  findMessages,
} from "@/server/repositories/conversations";
import {
  HistorySchema,
  ListSchema,
  MessageSchema,
  TransitionSchema,
} from "@/server/schemas/conversations";
import type {
  Conversation,
  ConversationDTO,
  MessageDTO,
  SessionUser,
} from "@/types/domain";
import { IdSchema } from "@/server/schemas/uuid";

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
  };
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
  } else if (query.status !== "all") filter.status = query.status;
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { subject: { $regex: escaped, $options: "i" } },
      { customerName: { $regex: escaped, $options: "i" } },
    ];
  }
  if (query.cursor) {
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
  const conversation = await findConversation(IdSchema.parse(input));
  checkAccess(user, conversation);
  return serialize(conversation);
}

export async function getMessages(input: unknown) {
  const user = await requireUser();
  const query = HistorySchema.parse(input);
  checkAccess(user, await findConversation(query.conversationId));
  const filter: Filter<import("@/types/domain").Message> = {
    conversationId: query.conversationId,
  };
  if (query.cursor)
    filter.$or = [
      { createdAt: { $lt: new Date(query.cursor.date) } },
      { createdAt: new Date(query.cursor.date), _id: { $lt: query.cursor.id } },
    ];
  const rows = await findMessages(filter, 51);
  const items: MessageDTO[] = rows
    .slice(0, 50)
    .map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  const last = items.at(-1);
  return {
    items: items.reverse(),
    nextCursor:
      rows.length > 50 && last ? { date: last.createdAt, id: last._id } : null,
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
  const filter: Filter<Conversation> = {
    _id: data.conversationId,
    version: data.version,
  };
  if (data.operation === "assume") {
    filter.status = "waiting";
    filter.agentId = null;
  } else {
    filter.status = "active";
    filter.agentId = user.uid;
  }
  const now = new Date();
  const update =
    data.operation === "assume"
      ? {
          status: "active" as const,
          agentId: user.uid,
          agentName: user.name,
          updatedAt: now,
        }
      : {
          status:
            data.operation === "close"
              ? ("closed" as const)
              : ("waiting" as const),
          agentId: data.operation === "close" ? user.uid : null,
          agentName: data.operation === "close" ? user.name : null,
          updatedAt: now,
        };
  await transitionRecord(filter, update, {
    _id: randomUUID(),
    conversationId: data.conversationId,
    actorId: user.uid,
    operation: data.operation,
    createdAt: now,
  });
}
