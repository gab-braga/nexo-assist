import { z } from "zod";
import type { AgentStreamEvent } from "@/types/ai";
import { AgentActionSchema } from "@/lib/schemas/agent-actions";

const eventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("started"),
    runId: z.string(),
    conversationId: z.string().optional(),
  }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({ type: z.literal("action"), action: AgentActionSchema }),
  z.object({ type: z.literal("error"), code: z.string(), error: z.string() }),
  z.object({
    type: z.literal("completed"),
    message: z.object({
      _id: z.string(),
      conversationId: z.string(),
      authorId: z.string(),
      authorName: z.string(),
      role: z.literal("assistant"),
      text: z.string(),
      createdAt: z.string(),
      sequence: z.number().int().optional(),
      runId: z.string().optional(),
      processingState: z
        .enum(["processing", "completed", "interrupted", "failed"])
        .optional(),
      processingErrorCode: z.string().nullable().optional(),
      decisionRefs: z.array(z.string()).optional(),
      actions: z.array(AgentActionSchema).max(30).optional(),
    }),
  }),
]);

export class AgentStreamError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function consumeAgentStream(
  response: Response,
  onEvent: (event: AgentStreamEvent) => void,
) {
  if (!response.ok) {
    const body: unknown = await response.json();
    const parsed = z
      .object({ error: z.string(), code: z.string().optional() })
      .safeParse(body);
    throw new AgentStreamError(
      parsed.success ? (parsed.data.code ?? "HTTP_ERROR") : "HTTP_ERROR",
      parsed.success
        ? parsed.data.error
        : "Não foi possível enviar a mensagem.",
    );
  }
  if (!response.body) throw new Error("Resposta do assistente indisponível.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      if (buffer.length > 100000)
        throw new Error("Resposta inválida do assistente.");
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = eventSchema.parse(JSON.parse(line));
        if (event.type === "error")
          throw new AgentStreamError(event.code, event.error);
        if (event.type === "completed") terminal = true;
        onEvent(event);
      }
      if (done) break;
    }
    if (!terminal)
      throw new Error(
        "A resposta foi interrompida. Atualize a conversa para verificar o resultado.",
      );
  } finally {
    reader.releaseLock();
  }
}
