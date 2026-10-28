"use client";

import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { user } from "@/data/data";

export function LoginForm() {
  const router = useRouter();
  const [show, setShow] = useState(false);

  return (
    <form
      data-visual="login-form"
      className="w-95 -mt-8.75 [&>h2]:font-serif [&>h2]:text-[36px] [&>h2]:leading-[1.2] [&>h2]:mb-3.2 [&>h2]:font-normal [&>p]:text-muted-foreground [&>p]:text-[15px] [&>p]:mb-6.5 [&>p]:whitespace-nowrap [&_label]:text-[13px] [&_label]:block [&_label]:mb-1.5 max-[1250.001px]:w-full max-[1250.001px]:[&>p]:whitespace-normal max-[800.001px]:max-w-105 max-[800.001px]:mt-0"
      onSubmit={(e) => {
        e.preventDefault();
        router.push("/chat");
      }}
    >
      <h2>Entrar</h2>
      <p>Use seu e-mail corporativo e a senha da rede Nexo.</p>
      <label htmlFor="email">E-mail corporativo</label>
      <div
        data-visual="input-icon"
        className="flex items-center border border-[#dfe2e7] rounded-[9px] h-11.5 px-3.25 gap-2.5 shadow-[0_1px_2px_#00000005] [&_svg]:size-4 [&_svg]:text-muted-foreground [&>input]:min-w-0 [&>input]:w-full [&>input]:text-[14px] [&>input]:bg-transparent [&>input]:focus-visible:outline-none focus-within:border-[#0785ff] focus-within:shadow-[0_0_0_1px_#0785ff]"
      >
        <Mail />
        <input
          className="[-webkit-tap-highlight-color:transparent] outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          id="email"
          type="email"
          required
          defaultValue={user.email}
        />
      </div>
      <div
        data-visual="password-label"
        className="flex justify-between mt-4 text-[13px] [&>button]:text-primary [&>button]:mb-1.5"
      >
        <label htmlFor="password">Senha</label>
        <button
          className="cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 disabled:cursor-default"
          type="button"
        >
          Esqueci minha senha
        </button>
      </div>
      <div
        data-visual="input-icon password-input"
        className="flex items-center border rounded-[9px] h-11.5 px-3.25 gap-2.5 [&_svg]:size-4 [&_svg]:text-muted-foreground [&>input]:min-w-0 [&>input]:w-full [&>input]:text-[14px] [&>input]:bg-transparent [&>input]:focus-visible:outline-none focus-within:border-[#0785ff] focus-within:shadow-[0_0_0_1px_#0785ff] border-[#0785ff] shadow-[0_0_0_1px_#0785ff] [&>svg]:text-[#0785ff] [&>input]:tracking-[4px]"
      >
        <LockKeyhole />
        <input
          className="[-webkit-tap-highlight-color:transparent] outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          id="password"
          type={show ? "text" : "password"}
          minLength={4}
          required
          defaultValue="nexoassist1"
        />
        <button
          className="cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 disabled:cursor-default"
          type="button"
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          onClick={() => setShow(!show)}
        >
          {show ? <EyeOff /> : <Eye />}
        </button>
      </div>
      <label
        data-visual="remember"
        className="[&&]:flex [&&]:items-center [&&]:gap-2.25 [&&]:mt-4.75 [&&]:mb-6.75 [&&]:text-[#435066] [&>input]:accent-primary [&>input]:size-4.5"
      >
        <input
          className="[-webkit-tap-highlight-color:transparent] outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          type="checkbox"
          defaultChecked
        />
        Manter conectado neste computador
      </label>
      <Button
        data-visual="login-submit"
        size="lg"
        className="w-full shadow-[0_7px_14px_#0063c920] text-[15px]"
        type="submit"
      >
        Entrar <ArrowRight />
      </Button>
      <div
        data-visual="login-rule"
        className="border-t border-border mt-6.75"
      />
    </form>
  );
}
