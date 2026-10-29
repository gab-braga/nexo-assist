import { z } from "zod";
import { IdSchema } from "@/server/schemas/uuid";
import { MessageTextSchema } from "@/lib/schemas/conversation-forms";
import { TicketDataSchema } from "@/server/schemas/tickets";

export const AgentTurnSchema = z
  .object({
    requestId: IdSchema,
    conversationId: IdSchema,
    text: MessageTextSchema,
    startConversation: z.literal(true).optional(),
  })
  .strict();

export type AgentTurnInput = z.infer<typeof AgentTurnSchema>;

// Internal server-to-repository contract; never included in the HTTP turn body.
export const IntentSchema = z.enum([
  "knowledge",
  "tickets",
  "status",
  "create",
  "update",
  "reopen",
  "handoff",
  "clarify",
  "out_of_scope",
]);

export const ConversationFlowSchema = z
  .object({
    intent: IntentSchema,
    stage: z.enum([
      "collecting",
      "selecting",
      "knowledge",
      "awaiting_confirmation",
      "idle",
    ]),
    data: TicketDataSchema.partial().optional(),
    environment: z.string().trim().max(120).optional(),
    question: z.string().trim().max(300).optional(),
    choices: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(80),
            message: z.string().trim().min(1).max(300),
          })
          .strict(),
      )
      .max(4)
      .optional(),
    ticketIds: z.array(IdSchema).max(5).optional(),
  })
  .strict();

export const ConversationContextPatchSchema = z
  .object({
    selectedTicketId: IdSchema.nullable().optional(),
    pendingDraftId: IdSchema.nullable().optional(),
    flow: ConversationFlowSchema.optional(),
  })
  .strict();

export const ToolResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({ ok: z.literal(false), code: z.string(), error: z.string() }),
]);

export const rationaleSchema = z
  .string()
  .trim()
  .min(3)
  .max(400)
  .describe(
    "Justificativa objetiva baseada na solicitação, sem raciocínio interno.",
  );
