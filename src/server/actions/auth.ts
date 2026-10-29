"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminAuth } from "@/server/lib/firebase/firebase-admin";
import { AppError, result } from "@/server/lib/errors";
import { SESSION_COOKIE, getSession } from "@/auth/session";
import { syncUser } from "@/server/repositories/users";
import { LoginSchema } from "@/server/schemas/auth";

export async function login(input: unknown) {
  return result(async () => {
    const { idToken, remember } = LoginSchema.parse(input);
    const auth = getAdminAuth();
    const token = await auth.verifyIdToken(idToken, true);
    if (Date.now() / 1000 - token.auth_time > 300)
      throw new AppError("AUTH", "Entre novamente para iniciar a sessão.");
    const user = await auth.getUser(token.uid);
    const role = user.customClaims?.role;
    if (
      user.disabled ||
      (role !== "chat" && role !== "agent") ||
      token.role !== role
    ) {
      throw new AppError(
        "FORBIDDEN",
        "Sua conta não possui acesso. Entre em contato com a TI.",
      );
    }
    await syncUser({
      uid: user.uid,
      name: user.displayName || user.email || "Usuário",
      email: user.email ?? "",
      role,
    });
    const expiresIn = (remember ? 5 * 24 : 8) * 60 * 60 * 1000;
    const value = await auth.createSessionCookie(idToken, { expiresIn });
    (await cookies()).set(SESSION_COOKIE, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      ...(remember ? { maxAge: expiresIn / 1000 } : {}),
    });
    return { destination: role === "agent" ? "/agent" : "/chat" };
  });
}

export async function logout() {
  try {
    const user = await getSession();
    if (user) await getAdminAuth().revokeRefreshTokens(user.uid);
  } catch {
    console.error("Session revocation unavailable during logout");
  } finally {
    (await cookies()).delete(SESSION_COOKIE);
  }
  redirect("/");
}
