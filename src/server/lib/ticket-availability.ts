import "server-only";
import { AppError } from "./errors";

// No client-controlled switch and no random failures. Also injectable in service tests.
export function checkTicketAvailability() {
  const until = process.env.TICKET_SERVICE_UNAVAILABLE_UNTIL;
  if (until && Date.now() < Date.parse(until))
    throw new AppError(
      "TEMPORARILY_UNAVAILABLE",
      "Serviço de chamados indisponível. Tente novamente com a mesma confirmação.",
    );
}

export async function ticketBackend<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (
      [
        "MongoNetworkError",
        "MongoNetworkTimeoutError",
        "MongoServerSelectionError",
        "MongoOperationTimeoutError",
      ].includes(name)
    )
      throw new AppError(
        "TEMPORARILY_UNAVAILABLE",
        "Serviço de chamados indisponível. Repita a mesma operação; não prepare outra criação.",
      );
    throw error;
  }
}
