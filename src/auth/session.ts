import "server-only";
import { cookies } from "next/headers";
import { getAdminAuth } from "@/server/lib/firebase/firebase-admin";
import type { SessionUser } from "@/types/domain";
import { cache } from "react";

export const SESSION_COOKIE = "nexo-session";

export const getSession = cache(async (): Promise<SessionUser | null> => {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  try {
    const token = await getAdminAuth().verifySessionCookie(value, true);
    const user = await getAdminAuth().getUser(token.uid);
    const role = user.customClaims?.role;
    // Reject stale claims even if the administrator did not revoke old sessions.
    if (
      user.disabled ||
      (role !== "chat" && role !== "agent") ||
      token.role !== role
    )
      return null;
    return {
      uid: user.uid,
      email: user.email ?? "",
      name: user.displayName || user.email || "Usuário",
      role,
    };
  } catch {
    return null;
  }
});
