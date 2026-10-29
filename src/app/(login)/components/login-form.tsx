"use client";

import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import { getClientAuth } from "@/server/lib/firebase/firebase-client";
import { login } from "@/server/actions/auth";

export function LoginForm() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const auth = await getClientAuth();
      try {
        const credential = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );
        const response = await login({
          idToken: await credential.user.getIdToken(true),
          remember,
        });
        if (!response.ok) {
          setMessage(response.error);
          return;
        }
        router.replace(response.data.destination);
        router.refresh();
      } finally {
        await signOut(auth);
      }
    } catch {
      setMessage(
        "Não foi possível entrar. Verifique seus dados ou entre em contato com a TI.",
      );
    } finally {
      setPending(false);
    }
  }
  async function reset() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage("Informe seu e-mail para redefinir a senha.");
      return;
    }
    setPending(true);
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
    <form
      data-visual="login-form"
      className="w-95 -mt-8.75 [&>h2]:font-serif [&>h2]:text-[36px] [&>h2]:leading-[1.2] [&>h2]:mb-3.2 [&>h2]:font-normal [&>p]:text-muted-foreground [&>p]:text-[15px] [&>p]:mb-6.5 [&>p]:whitespace-nowrap [&_label]:text-[13px] [&_label]:block [&_label]:mb-1.5 max-[1250.001px]:w-full max-[1250.001px]:[&>p]:whitespace-normal max-[800.001px]:max-w-105 max-[800.001px]:mt-0"
      onSubmit={submit}
    >
      <h2>Entrar</h2>
      <p>Use a conta fornecida pela TI.</p>
      {message && (
        <div role="status" className="mb-4 text-sm">
          {message}
        </div>
      )}
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
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          maxLength={254}
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
          disabled={pending}
          onClick={reset}
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
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
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
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
        />
        Manter conectado neste computador
      </label>
      <Button
        data-visual="login-submit"
        size="lg"
        className="w-full shadow-[0_7px_14px_#0063c920] text-[15px]"
        type="submit"
        disabled={pending}
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
