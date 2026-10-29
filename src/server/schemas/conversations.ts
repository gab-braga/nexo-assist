import { z } from "zod";
import {
  SubjectSchema,
  MessageTextSchema,
  SearchSchema,
  StatusSchema,
} from "@/lib/schemas/conversation-forms";
import { IdSchema } from "./uuid";

export const ListSchema = z.object({
  status: StatusSchema.default("all"),
  search: SearchSchema.default(""),
  cursor: z.object({ date: z.iso.datetime(), id: IdSchema }).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const CreateSchema = z.object({
  requestId: IdSchema,
  subject: SubjectSchema,
});

export const MessageSchema = z.object({
  requestId: IdSchema,
  conversationId: IdSchema,
  text: MessageTextSchema,
});

export const TransitionSchema = z.object({
  conversationId: IdSchema,
  version: z.number().int().min(0),
  operation: z.enum(["assume", "release", "close"]),
});

export const HistorySchema = z.object({
  conversationId: IdSchema,
  cursor: z.object({ date: z.iso.datetime(), id: IdSchema }).optional(),
});
