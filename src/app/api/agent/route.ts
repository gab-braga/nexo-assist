import { ZodError } from "zod";
import { startAgentTurn, agentError } from "@/server/services/agent-turns";
import { readAgentBody, validateAgentRequest } from "@/server/ai/http";

export const runtime = "nodejs";
export const maxDuration = 70;

export async function POST(request: Request) {
  try {
    validateAgentRequest(request);
    const cancellation = new AbortController();
    const events = await startAgentTurn(await readAgentBody(request), AbortSignal.any([request.signal, cancellation.signal]));
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of events) {
            if (!cancellation.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          }
        } catch {
          if (!cancellation.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify({ type: "error", code: "AI_UNAVAILABLE", error: "Não foi possível concluir o atendimento. Atualize a conversa para verificar o resultado." }) + "\n"));
        } finally { if (!cancellation.signal.aborted) controller.close(); }
      },
      cancel() { cancellation.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
  } catch (error) {
    const failure = error instanceof ZodError ? { code: "VALIDATION", error: "Mensagem inválida." } : agentError(error);
    const status = ({ UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 400,
      RUN_IN_PROGRESS: 409, CONFLICT: 409, HUMAN_CONTROL: 409, MESSAGE_LIMIT: 429, AI_NOT_CONFIGURED: 503 } as Record<string, number>)[failure.code] ?? 503;
    return Response.json({ ok: false, ...failure }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
