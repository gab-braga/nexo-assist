import type { Filter } from "mongodb";
import type { Message } from "@/types/domain";

export type MessageCursor = { date: string; id: string; sequence?: number };

/** Sequenced messages precede legacy documents; legacy dates/IDs remain a stable tie-breaker. */
export function messageHistoryFilter(
  conversationId: string,
  cursor?: MessageCursor,
): Filter<Message> {
  const filter: Filter<Message> = { conversationId };
  if (cursor?.sequence !== undefined) {
    filter.$or = [
      { sequence: { $lt: cursor.sequence } },
      { sequence: { $exists: false } },
    ];
  } else if (cursor) {
    filter.sequence = { $exists: false };
    filter.$or = [
      { createdAt: { $lt: new Date(cursor.date) } },
      { createdAt: new Date(cursor.date), _id: { $lt: cursor.id } },
    ];
  }
  return filter;
}
