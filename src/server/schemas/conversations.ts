import { z } from "zod";
import { IdSchema } from "./uuid";

export const ListSchema = z.object({
  status: z.enum(["all", "waiting", "active", "closed", "mine"]).default("all"),
  search: z.string().trim().max(100).default(""),
  cursor: z.object({ date: z.iso.datetime(), id: IdSchema }).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const CreateSchema = z.object({
  requestId: IdSchema,
  subject: z.string().trim().min(3).max(160),
});

export const MessageSchema = z.object({
  requestId: IdSchema,
  conversationId: IdSchema,
  text: z.string().trim().min(1).max(8000),
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
