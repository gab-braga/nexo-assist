"use client";

import { useState } from "react";
import { KeyRound, Mail, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getClientAuth } from "@/server/lib/firebase/firebase-client";
import { sendPasswordResetEmail } from "firebase/auth";
import type { SessionUser } from "@/types/domain";

export function ProfileDetails({ user }: { user: SessionUser }) {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function reset() {
    setPending(true);
    setError("");
    try {
      await sendPasswordResetEmail(await getClientAuth(), user.email);
      setSent(true);
    } catch {
      setError("Não foi possível solicitar a redefinição. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      data-visual="card password-card"
      className="mt-7.5 overflow-hidden rounded-[17px] border border-border bg-card shadow-[0_1px_2px_#18233408,0_5px_14px_#18233403]"
    >
      <div
        data-visual="password-card-main"
        className="flex items-center gap-4 p-6 [&_strong]:font-medium [&_p]:text-muted-foreground [&_p]:text-[13px] [&>button]:ml-auto [&>button]:text-[#344156] max-[800.001px]:p-4 max-[800.001px]:gap-2.5 max-[800.001px]:flex-wrap max-[540.001px]:[&>button]:ml-0 max-[540.001px]:[&>button]:w-full"
      >
        <span
          data-visual="key-icon"
          className="size-10 bg-muted rounded-full grid place-items-center text-[#435066]"
        >
          <KeyRound size={19} />
        </span>
        <div>
          <strong>Senha</strong>
          <p>Gerenciada pela TI</p>
        </div>
        <Button variant="outline" onClick={reset} disabled={pending || sent}>
          <RotateCcw />
          {sent ? "Link enviado" : "Redefinir senha"}
        </Button>
      </div>

      <div
        data-visual="password-note"
        className="flex gap-2 items-center bg-muted border-t border-border py-2.5 px-6 text-muted-foreground text-[12px] max-[800.001px]:py-3 max-[800.001px]:px-4 max-[800.001px]:items-start max-[800.001px]:text-[11px] max-[800.001px]:[&>svg]:shrink-0"
        role="status"
      >
        <Mail size={14} />
        {error ||
          (sent
            ? "Se houver uma conta, enviaremos instruções para"
            : "Enviaremos um link de redefinição para")}{" "}
        {user.email}.
      </div>
    </section>
  );
}
