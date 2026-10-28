import Image from "next/image";
import { LoginForm } from "./components/login-form";
import { Status } from "@/components/status";
import { loginDemo } from "@/data/data";

export default function LoginPage() {
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
            Descreva o que está acontecendo. O assistente consulta seus
            chamados, busca na central de ajuda e chama um analista quando
            precisa.
          </p>
          <div
            data-visual="story-demo"
            className="max-w-125.5 mt-9 ml-auto mr-18.75 border border-[#ffffff12] rounded-[17px] bg-[#ffffff03] p-4.25 text-[13px] [&>p]:text-[12px] [&>p]:mt-2.25 [&>p]:mb-1.25 [&>p]:text-[#ddd] [&>p>span]:text-[#9299a3] [&>p>span]:ml-1 max-[1250.001px]:mr-0 max-[800.001px]:hidden"
          >
            <div
              data-visual="demo-user"
              className="bg-card text-[#1c2633] rounded-[12px_12px_3px_12px] py-2 px-3.25 w-fit ml-auto"
            >
              {loginDemo.question}
            </div>
            <p>
              Nexo Assist{" "}
              <span>consultou seus chamados · criou um chamado</span>
            </p>
            <div
              data-visual="demo-answer"
              className="py-2.5 px-3.5 bg-[#ffffff16] rounded-[0_13px_13px_13px] max-w-95 leading-5.25"
            >
              {loginDemo.answer}
            </div>
            <div
              data-visual="demo-ticket"
              className="flex gap-2 items-center bg-card text-muted-foreground rounded-xl py-1.5 px-3 mt-1.5 w-fit text-[12px] *:data-[slot=status]:text-[#1c2633] *:data-[slot=status]:font-semibold"
            >
              <Status color="amber">{loginDemo.ticket}</Status>
              <span>Rede e VPN · Alta · em até 4 h</span>
            </div>
          </div>
        </div>
        <div
          data-visual="story-stats"
          className="grid grid-cols-[1fr_1fr_1fr] mt-auto pt-5.75 border-t border-[#ffffff16] gap-6 [&>div+div]:border-l [&>div+div]:border-[#ffffff16] [&>div+div]:pl-6 [&_strong]:font-serif [&_strong]:text-[30px] [&_strong]:font-normal [&_strong]:flex [&_strong]:items-center [&_strong]:gap-2.25 [&_strong]:mb-1.25 [&_i]:inline-block [&_i]:size-2 [&_i]:shrink-0 [&_i]:rounded-full [&_i]:bg-[#00bd7d] [&_span]:text-[13px] [&_span]:text-[#a6aab2] [&_span]:whitespace-nowrap max-[1250.001px]:grid-cols-3 max-[1250.001px]:gap-3 max-[1250.001px]:[&>div+div]:pl-3 max-[1250.001px]:[&_span]:text-[10px] max-[800.001px]:mt-7.5 max-[800.001px]:[&_strong]:text-[24px] max-[540.001px]:[&_span]:whitespace-normal"
        >
          <div>
            <strong>8 s</strong>
            <span>primeira resposta, em média</span>
          </div>
          <div>
            <strong>72%</strong>
            <span>resolvidos sem fila</span>
          </div>
          <div>
            <strong>
              6 <i />
            </strong>
            <span>analistas online agora</span>
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
