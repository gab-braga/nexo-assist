import { z } from "zod";

export const AgentActionSchema = z
  .object({
    id: z.string().max(160),
    conversationId: z.string().max(100),
    messageId: z.string().max(100),
    runId: z.string().max(100).optional(),
    order: z.number().int().min(0),
    type: z.string().max(60),
    source: z.enum(["model", "service", "rule"]),
    state: z.enum(["running", "succeeded", "failed", "not_started", "unknown"]),
    title: z.string().max(160),
    summary: z.string().max(500),
    at: z.string(),
    durationMs: z.number().min(0).optional(),
    tool: z.string().max(80).optional(),
    details: z
      .array(
        z
          .object({ label: z.string().max(80), value: z.string().max(500) })
          .strict(),
      )
      .max(16),
    evidence: z
      .array(
        z
          .object({
            kind: z.enum(["article", "ticket", "draft"]),
            id: z.string().max(120),
            label: z.string().max(180),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();
export type AgentAction = z.infer<typeof AgentActionSchema>;
