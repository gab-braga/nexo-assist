import "server-only";
import { AppError } from "@/server/lib/errors";

export const AI_LIMITS = {
  messages: 30,
  steps: 6,
  tools: 8,
  outputTokens: 2048,
  timeoutMs: 60000,
  contextChars: 16000,
} as const;

export function aiModelId() {
  return process.env.NEXO_AI_MODEL || "gpt-5.4-mini";
}

export function ensureAIConfigured() {
  if (!process.env.OPENAI_API_KEY?.trim())
    throw new AppError(
      "AI_NOT_CONFIGURED",
      "O assistente ainda não está configurado. Entre em contato com a TI.",
    );
}
