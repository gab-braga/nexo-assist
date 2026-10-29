import "server-only";
import { Agent } from "@mastra/core/agent";
import { createOpenAI } from "@ai-sdk/openai";
import { createNexoTools } from "../tools";
import { NEXO_INSTRUCTIONS } from "../prompts/nexo";
import { aiModelId, ensureAIConfigured } from "../config";
import type { MastraModelConfig } from "@mastra/core/llm";
import { ticketService } from "@/server/services/tickets";

export function createNexoAgent(
  model: MastraModelConfig | (() => MastraModelConfig),
  tools: ReturnType<typeof createNexoTools>,
) {
  return new Agent({
    id: "nexo-assist",
    name: "nexoAgent",
    instructions: NEXO_INSTRUCTIONS,
    model,
    tools,
  });
}

// Lazy service imports keep transport/session code out of model and tool tests.
const tools = createNexoTools({
  tickets: ticketService,
  knowledge: async (input) =>
    (await import("@/server/services/knowledge")).listKnowledgeArticles(input),
});

export const nexoAgent = createNexoAgent(() => {
  ensureAIConfigured();
  return createOpenAI({ apiKey: process.env.OPENAI_API_KEY }).responses(
    aiModelId(),
  );
}, tools);
