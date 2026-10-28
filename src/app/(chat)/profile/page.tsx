"use client";

import { useState } from "react";
import { KeyRound, LockKeyhole, Mail, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { user } from "@/data/data";

export default function ProfilePage() {
  const [sent, setSent] = useState(false);

  return (
    <main
      data-visual="profile-page"
      className="w-150 max-w-[calc(100%-48px)] my-11.25 mx-auto [&>h1]:text-[24px] [&>h1]:font-bold [&>h1]:tracking-[-0.6px] [&>h1]:mb-0.5 [&>p]:text-muted-foreground [&>p]:mb-7.5 max-[800.001px]:mt-7.5 max-[540.001px]:max-w-[calc(100%-26px)] max-[540.001px]:mt-6.5 max-[540.001px]:[&>h1]:text-[22px] max-[540.001px]:[&>p]:text-[12px]"
    >
      <h1>Meu perfil</h1>
      <p>Seus dados de acesso ao service desk de TI.</p>
      <section
        data-visual="card profile-details"
        className="[&>div]:flex [&>div]:items-center [&>div]:py-4.5 [&>div]:px-6 [&>div]:gap-3 [&>div]:min-h-14.25 [&>div+div]:border-t [&_span]:w-41 [&_span]:shrink-0 [&_span]:text-[13px] [&_span]:text-muted-foreground [&_strong]:text-[14px] [&_strong]:font-normal [&_small]:flex [&_small]:items-center [&_small]:gap-1 [&_small]:ml-auto [&_small]:whitespace-nowrap max-[1250.001px]:[&>div]:flex-wrap max-[1250.001px]:[&_small]:ml-44 max-[800.001px]:[&>div]:p-4 max-[800.001px]:[&_span]:w-full max-[800.001px]:[&_small]:m-0 max-[540.001px]:[&_strong]:text-[12px] max-[540.001px]:[&_strong]:break-all overflow-hidden rounded-[17px] border border-border bg-card shadow-[0_1px_2px_#18233408,0_5px_14px_#18233403]"
      >
        <div>
          <span>Nome</span>
          <strong>{user.name}</strong>
        </div>
        <div>
          <span>E-mail corporativo</span>
          <strong>{user.email}</strong>
          <small className="text-[12px] text-muted-foreground">
            <LockKeyhole size={13} /> Gerenciado pela TI
          </small>
        </div>
      </section>
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
            <p>Alterada há 42 dias</p>
          </div>
          <Button
            variant="outline"
            onClick={() => setSent(true)}
            disabled={sent}
          >
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
          {sent
            ? "Link de redefinição enviado para"
            : "Enviaremos um link de redefinição para"}{" "}
          {user.email}.
        </div>
      </section>
    </main>
  );
}
