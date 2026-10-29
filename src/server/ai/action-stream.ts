import type { NexoRunContext } from "./context";
import type { AgentAction } from "@/lib/schemas/agent-actions";

/** Multiplex the existing NDJSON response; no separate connection or stream endpoint. */
export async function* actionStream<T>(
  source: AsyncIterable<T>,
  scope: NexoRunContext,
): AsyncGenerator<
  { kind: "action"; action: AgentAction } | { kind: "chunk"; chunk: T }
> {
  const iterator = source[Symbol.asyncIterator]();
  let next = iterator
    .next()
    .then((result) => ({ kind: "chunk" as const, result }));
  try {
    for (;;) {
      while (scope.pendingActions.length)
        yield { kind: "action", action: scope.pendingActions.shift()! };
      const event = await Promise.race([
        next,
        scope.waitForAction().then(() => ({ kind: "wake" as const })),
      ]);
      if (event.kind === "wake") continue;
      if (event.result.done) break;
      yield { kind: "chunk", chunk: event.result.value };
      next = iterator
        .next()
        .then((result) => ({ kind: "chunk" as const, result }));
    }
  } finally {
    // Consume cancellation rejections; the service aborts the provider in its finally.
    void next.catch(() => {});
    void iterator.return?.().catch(() => {});
  }
}
