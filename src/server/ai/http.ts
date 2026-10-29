import "server-only";
import { AppError } from "@/server/lib/errors";

export function validateAgentRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new AppError("FORBIDDEN", "Origem não permitida.");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError("VALIDATION", "Formato inválido.");
  if (Number(request.headers.get("content-length") ?? 0) > 20000)
    throw new AppError("VALIDATION", "Mensagem muito grande.");
}

export async function readAgentBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("VALIDATION", "Mensagem ausente.");
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 20000) {
        await reader.cancel();
        throw new AppError("VALIDATION", "Mensagem muito grande.");
      }
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("VALIDATION", "Mensagem inválida.");
  } finally {
    reader.releaseLock();
  }
}
