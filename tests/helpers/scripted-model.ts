import type { LanguageModelV4, LanguageModelV4StreamPart } from "@ai-sdk/provider-v7";

export function scriptedModel(steps: LanguageModelV4StreamPart[][]): LanguageModelV4 {
  let index = 0;
  return {
    specificationVersion: "v4", provider: "test", modelId: "scripted-service-desk", supportedUrls: {},
    doGenerate: async () => { throw new Error("Streaming test only"); },
    doStream: async () => {
      const content = steps[index++];
      if (!content) throw new Error("Unexpected model step");
      return { stream: new ReadableStream<LanguageModelV4StreamPart>({ start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] });
        for (const part of content) controller.enqueue(part);
        controller.enqueue({ type: "finish", finishReason: { unified: content.some(part => part.type === "tool-call") ? "tool-calls" : "stop", raw: undefined },
          usage: { inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } } });
        controller.close();
      } }) };
    },
  };
}
export function toolCall(name: string, input: unknown): LanguageModelV4StreamPart {
  return { type: "tool-call", toolCallId: crypto.randomUUID(), toolName: name, input: JSON.stringify(input) };
}
export function textParts(text: string): LanguageModelV4StreamPart[] {
  return [{ type: "text-start", id: "text" }, { type: "text-delta", id: "text", delta: text }, { type: "text-end", id: "text" }];
}
