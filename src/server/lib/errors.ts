import "server-only";
import { ZodError } from "zod";
import type { Result } from "@/types/domain";

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function result<T>(
  operation: () => Promise<T>,
): Promise<Result<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    if (error instanceof AppError)
      return { ok: false, code: error.code, error: error.message };

    if (error instanceof ZodError)
      return {
        ok: false,
        code: "VALIDATION",
        error: error.issues[0]?.message ?? "Dados inválidos.",
      };

    // Do not log provider errors: they may contain connection credentials or tokens.
    console.error(
      "Application operation failed",
      error instanceof Error ? error.name : "UnknownError",
    );

    return {
      ok: false,
      code: "INTERNAL",
      error: "Não foi possível concluir a operação. Tente novamente.",
    };
  }
}
