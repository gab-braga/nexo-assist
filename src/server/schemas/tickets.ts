import { z } from "zod";
import { ticketCategories } from "@/types/tickets";
import { IdSchema } from "./uuid";

export const TicketDataSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().min(10).max(8000),
    type: z.enum(["INC", "REQ"]),
    category: z.enum(ticketCategories),
    impact: z.enum(["person", "team", "company"]),
    urgency: z.enum(["blocked", "today", "workaround", "normal"]),
  })
  .strict();

export const PrepareTicketSchema = z
  .object({
    operation: z.enum(["create", "update", "reopen", "handoff"]),
    ticketId: IdSchema.optional(),
    version: z.number().int().min(0).optional(),
    data: TicketDataSchema.optional(),
    reason: z.string().trim().min(3).max(2000).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.operation === "create" &&
      (!data.data || data.ticketId || data.version !== undefined)
    )
      ctx.addIssue({
        code: "custom",
        message: "A criação exige dados e não aceita chamado existente.",
      });
    if (
      data.operation !== "create" &&
      (!data.ticketId || data.version === undefined)
    )
      ctx.addIssue({ code: "custom", message: "Informe chamado e versão." });
    if (data.operation === "update" && !data.data)
      ctx.addIssue({
        code: "custom",
        message: "Informe os dados atualizados.",
      });
    if (data.operation === "handoff" && !data.reason)
      ctx.addIssue({
        code: "custom",
        message: "Informe o motivo do encaminhamento.",
      });
    if (["handoff", "reopen"].includes(data.operation) && data.data)
      ctx.addIssue({
        code: "custom",
        message: "Esta operação não altera os dados do chamado.",
      });
  });

export const ConfirmTicketSchema = z
  .object({
    draftId: IdSchema,
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const ConversationDraftSchema = z
  .object({
    conversationId: IdSchema,
    draftId: IdSchema,
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const TicketListSchema = z
  .object({
    status: z.enum(["open", "waiting_human", "resolved"]).optional(),
    overdue: z.boolean().default(false),
    search: z.string().trim().max(160).default(""),
    cursor: z.object({ date: z.iso.datetime(), id: IdSchema }).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();

export const AdminTicketListSchema = TicketListSchema.extend({
  customerId: z.string().min(1).max(128).optional(),
});

export const ResolveTicketSchema = z
  .object({
    ticketId: IdSchema,
    version: z.number().int().min(0),
    reason: z.string().trim().min(3).max(2000),
  })
  .strict();

export const KnowledgeQuerySchema = z
  .object({ search: z.string().trim().max(160).default("") })
  .strict();
