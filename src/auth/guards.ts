import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "./session";
import { AppError } from "@/server/lib/errors";
import type { UserRole } from "@/types/domain";

export async function requireUser(role?: UserRole) {
  const user = await getSession();
  if (!user)
    throw new AppError(
      "UNAUTHENTICATED",
      "Sua sessão expirou. Entre novamente.",
    );
  if (role && role !== user.role)
    throw new AppError("FORBIDDEN", "Acesso não permitido.");
  return user;
}

export async function protectPage(role: UserRole) {
  const user = await getSession();
  if (!user) redirect("/");
  if (user.role !== role) redirect(user.role === "agent" ? "/agent" : "/chat");
  return user;
}
