"use server";

import { revalidatePath } from "next/cache";
import { result } from "@/server/lib/errors";
import * as service from "@/server/services/conversations";

export async function sendMessage(input: unknown) {
  return result(async () => {
    await service.sendMessage(input);
    revalidatePath("/chat");
    revalidatePath("/agent");
    return null;
  });
}

export async function transitionConversation(input: unknown) {
  return result(async () => {
    await service.transitionConversation(input);
    revalidatePath("/chat");
    revalidatePath("/agent");
    return null;
  });
}
