import Image from "next/image";
import { LoginForm } from "./components/login-form";
import { getSession } from "@/auth/session";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const user = await getSession();
  if (user) redirect(user.role === "agent" ? "/agent" : "/chat");

  return (
    <main
      data-visual="login-page"
      className="grid grid-cols-[55.55%_44.45%] min-h-dvh max-[800.001px]:grid-cols-1"
    >
      <section
        data-visual="login-story menu-anchor"
        className="relative flex min-h-225 flex-col bg-[#1c2633] text-white pt-10 px-[8%] pb-12 [&>a>b]:text-white max-[1250.001px]:px-[7%] max-[800.001px]:min-h-auto max-[800.001px]:p-6"
      >
        <div className="flex gap-2.5 items-center">
          <Image
            src="/nexo-assist-light.svg"
            width={24}
            height={24}
            alt="Nexo Assistant"
          />
          <span className="text-lg font-bold text-nowrap">Nexo Assist</span>
        </div>
        <div
          data-visual="story-content"
          className="mt-28 [&>h1]:font-serif [&>h1]:text-[48px] [&>h1]:font-normal [&>h1]:leading-[1.17] [&>h1]:tracking-[-1.8px] [&>h1]:m-0 [&>h1]:max-w-162.5 max-[1250.001px]:[&>h1]:text-[42px] max-[800.001px]:[&>h1]:text-[36px] max-[800.001px]:[&>h1]:max-w-135 max-[540.001px]:[&>h1]:text-[32px]"
        >
          <p data-visual="eyebrow" className="text-[14px] text-[#a8adb5] mb-3">
            Service desk de TI da Nexo
          </p>
          <h1>Seu problema de TI, resolvido em uma conversa.</h1>
          <p
            data-visual="story-description"
            className="text-[16px] leading-6.25 text-[#b5b9bf] max-w-127 mt-6.25 max-[800.001px]:text-[14px] max-[800.001px]:leading-5.75 max-[540.001px]:mt-5"
          >
            Descreva o que está acontecendo, converse com a equipe de TI e
            acompanhe o histórico dos seus atendimentos.
          </p>
          <div className="mt-9 rounded-2xl border border-white/10 bg-white/5 p-6 text-[#b5b9bf]">
            Seus atendimentos e mensagens em um só lugar.
          </div>
        </div>
      </section>
      <section
        data-visual="login-form-panel menu-anchor"
        className="relative flex items-center justify-center py-20 px-10 [&>footer]:absolute [&>footer]:bottom-9.5 [&>footer]:inset-x-[9%] [&>footer]:flex [&>footer]:justify-between [&>footer]:gap-4 [&>footer]:text-[12px] [&>footer]:text-muted-foreground max-[800.001px]:pt-18.75 max-[800.001px]:px-6 max-[800.001px]:pb-25 max-[800.001px]:[&>footer]:inset-x-6 max-[800.001px]:[&>footer]:bottom-6 max-[800.001px]:[&>footer]:text-[10px]"
      >
        <div
          data-visual="muted login-help"
          className="absolute right-[9%] top-10 text-muted-foreground text-[13px] [&>a]:text-primary [&>a]:font-medium [&>a]:ml-1.25 max-[800.001px]:top-6 max-[800.001px]:right-6"
        >
          Problema para entrar?{" "}
          <a
            className="cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 text-inherit no-underline"
            href="tel:4000"
          >
            Ligue no ramal 4000
          </a>
        </div>

        <LoginForm />

        <footer>
          <span>© 2026 Nexo · Service desk de TI</span>
          <button className="cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 disabled:cursor-default">
            Privacidade e uso de dados
          </button>
        </footer>
      </section>
    </main>
  );
}
