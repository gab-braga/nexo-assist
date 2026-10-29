import { z } from "zod";
import {
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

export const CustomerHistorySchema = ListSchema.pick({
  cursor: true,
  limit: true,
})
  .extend({
    limit: z.number().int().min(1).max(10).default(10),
  })
  .strict();

export const MessageSchema = z.object({
  requestId: IdSchema,
  conversationId: IdSchema,
  text: MessageTextSchema,
});

export const TransitionSchema = z
  .object({
    requestId: IdSchema.optional(),
    conversationId: IdSchema,
    version: z.number().int().min(0),
    operation: z.enum(["assume", "release", "return_to_ai", "close"]),
  })
  .strict();

export const HistorySchema = z.object({
  conversationId: IdSchema,
  cursor: z
    .object({
      date: z.iso.datetime(),
      id: IdSchema,
      sequence: z.number().int().min(1).optional(),
    })
    .optional(),
});

export const AnalystContextSchema = z
  .object({
    conversationId: IdSchema,
    cursor: z.object({ date: z.iso.datetime(), id: IdSchema }).optional(),
  })
  .strict();

export const HumanSupportSchema = z
  .object({ requestId: IdSchema, conversationId: IdSchema })
  .strict();
