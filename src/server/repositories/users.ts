import "server-only";
import { database } from "@/server/lib/mongodb";
import type { SessionUser } from "@/types/domain";

export async function syncUser(user: SessionUser) {
  const db = await database();
  await db
    .collection<{
      _id: string;
      name: string;
      email: string;
      updatedAt: Date;
      createdAt: Date;
    }>("users")
    .updateOne(
      { _id: user.uid },
      {
        $set: { name: user.name, email: user.email, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
}
