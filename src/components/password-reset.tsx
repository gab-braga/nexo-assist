"use client";
import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { getClientAuth } from "@/server/lib/firebase/firebase-client";
import { Button } from "@/components/ui/button";

export function PasswordReset({ email }: { email: string }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function reset() {
    setPending(true);
    setMessage("");
    try {
      await sendPasswordResetEmail(await getClientAuth(), email);
      setMessage(
        "Se houver uma conta com esse e-mail, você receberá as instruções de redefinição.",
      );
    } catch {
      setMessage("Não foi possível solicitar a redefinição. Tente novamente.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-3">
      <Button variant="outline" disabled={pending} onClick={reset}>
        Redefinir senha
      </Button>
      <p role="status">{message}</p>
    </div>
  );
}
