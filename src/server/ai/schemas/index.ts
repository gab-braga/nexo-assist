import { z } from "zod";
import { IdSchema } from "@/server/schemas/uuid";
import { MessageTextSchema } from "@/lib/schemas/conversation-forms";

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
export const ConversationContextPatchSchema = z
  .object({
    selectedTicketId: IdSchema.nullable().optional(),
    pendingDraftId: IdSchema.nullable().optional(),
  })
  .strict();

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
