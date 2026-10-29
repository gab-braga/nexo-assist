"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ArrowUpRight,
  Bot,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  Hand,
  Headset,
  LogOut,
  MessageCircle,
  MoreVertical,
  Send,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field";
import { ConversationFilters } from "./conversation-filters";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/avatar";
import { Status } from "@/components/status";
import { logout } from "@/server/actions/auth";
import {
  useConversationWorkspace,
  type WorkspaceProps,
} from "./use-conversation-workspace";

const colors = { waiting: "amber", active: "blue", closed: "gray" };

const names = {
  waiting: "Aguardando atendente",
  active: "Em atendimento",
  closed: "Encerrado",
};

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

const time = (date: string) =>
  new Date(date).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

const date = (value: string) =>
  new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  });

const subscribeMobile = (notify: () => void) => {
  const query = window.matchMedia("(max-width: 650px)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

export function AgentWorkspace(props: WorkspaceProps) {
  const { user, list, conversation, history, search, status, older } = props;
  const {
    pending,
    error,
    text,
    messageForm,
    href,
    send,
    change,
    canReply,
    navigate,
  } = useConversationWorkspace(props);

  const [mobileChat, setMobileChat] = useState(Boolean(conversation));
  const [details, setDetails] = useState(true);
  const [menu, setMenu] = useState(false);
  const [close, setClose] = useState(false);
  const [all, setAll] = useState(false);
  const [mobileDetails, setMobileDetails] = useState(false);

  const isMobile = useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia("(max-width: 650px)").matches,
    () => false,
  );

  const visibleDetails = details && (!isMobile || mobileDetails);
  const assumed =
    conversation?.status === "active" && conversation.agentId === user.uid;
  const closed = conversation?.status === "closed";

  return (
    <main
      data-visual="agent-console"
      className={cn(
        "group/console h-dvh grid grid-cols-[64px_380px_minmax(380px,1fr)_340px] overflow-hidden min-[1500px]:grid-cols-[64px_380px_minmax(450px,1fr)_340px] max-[1250.001px]:grid-cols-[58px_305px_minmax(360px,1fr)] max-[800.001px]:grid-cols-[54px_245px_minmax(360px,1fr)] max-[800.001px]:overflow-x-auto max-[650.001px]:grid-cols-[48px_minmax(0,1fr)] max-[650.001px]:overflow-hidden",
        !details &&
          "grid-cols-[64px_380px_minmax(380px,1fr)] min-[1500px]:grid-cols-[64px_380px_minmax(380px,1fr)]",
      )}
      data-mobile-chat={mobileChat}
      data-details={details}
    >
      <aside
        data-visual="agent-rail"
        className="bg-[#f6f7f9] border-r border-border flex items-center flex-col pt-5.75 pb-3.75 gap-5 [&>a>b]:size-6"
      >
        <Image
          src="/nexo-assist-dark.svg"
          width={24}
          height={24}
          alt="Nexo Assistant"
        />
        <button
          data-visual="rail-chat"
          className="cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 disabled:cursor-default relative size-10.25 border border-border rounded-[13px] bg-card grid place-items-center shadow-[0_1px_2px_#00000005] [&>svg]:w-5 [&>b]:absolute [&>b]:top-0.5 [&>b]:right-0 [&>b]:bg-primary [&>b]:text-white [&>b]:border-2 [&>b]:border-white [&>b]:rounded-full [&>b]:size-5 [&>b]:text-[10px]"
          aria-label="Conversas"
          onClick={() => {
            setMobileChat(false);
          }}
        >
          <MessageCircle />
          <b>{list.items.length}</b>
        </button>
        <div
          data-visual="rail-user"
          className="mt-auto *:data-[slot=avatar]:size-9 *:data-[slot=avatar]:text-[12px] *:data-[slot=avatar]:bg-[#e4f1fc]"
        >
          <Avatar initials={initials(user.name)} />
          <form action={logout}>
            <button
              aria-label="Sair"
              title="Sair"
              className="mt-3 cursor-pointer"
            >
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </aside>
      <aside
        data-visual="conversation-panel"
        className="border-r border-border overflow-y-auto py-3.75 px-2 max-[800.001px]:px-1 max-[650.001px]:col-start-2 max-[650.001px]:group-data-[mobile-chat=true]/console:hidden"
      >
        <div
          data-visual="conversation-heading"
          className="flex items-center justify-between px-1.75 pb-2.75 [&>h1]:text-[20px] [&>h1]:font-[650] [&>h1]:tracking-[-0.4px] max-[800.001px]:items-start max-[800.001px]:gap-1.25 max-[800.001px]:[&>h1]:text-[17px] max-[800.001px]:*:data-[slot=status]:text-[10px] max-[800.001px]:*:data-[slot=status]:py-1 max-[800.001px]:*:data-[slot=status]:px-1.5 max-[650.001px]:[&>h1]:text-[20px]"
        >
          <h1>Conversas</h1>
          <Status pill>Atendente</Status>
        </div>
        <ConversationFilters
          role={user.role}
          search={search}
          status={status}
          compact
        />
        <div
          data-visual="conversation-tabs"
          className="flex gap-1 px-1.75 pb-2.5 [&>button]:rounded-[30px] [&>button]:bg-muted [&>button]:py-1.25 [&>button]:px-2.25 [&>button]:text-[12px] [&>button]:whitespace-nowrap [&_b]:font-medium [&_b]:ml-0.75 max-[800.001px]:gap-0.75 max-[800.001px]:flex-wrap max-[800.001px]:[&>button]:text-[10px] max-[800.001px]:[&>button]:py-1 max-[800.001px]:[&>button]:px-1.5 max-[650.001px]:[&>button]:text-[12px] max-[650.001px]:[&>button]:py-1.25 max-[650.001px]:[&>button]:px-2.25"
        >
          {[
            ["Todas", "all"],
            ["Para você", "waiting"],
            ["Em atendimento", "active"],
            ["Minhas", "mine"],
          ].map(([label, value]) => (
            <button
              key={value}
              className={cn(
                "cursor-pointer",
                status === value && "[&&]:bg-secondary [&&]:text-primary",
              )}
              onClick={() => {
                navigate(
                  href({ status: value, conversation: null, cursor: null }),
                );
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {list.items.map((item) => (
          <button
            data-visual="conversation-item"
            className={cn(
              "cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 disabled:cursor-default group/conversation flex items-center gap-3 w-full pt-2.25 px-2.5 text-left rounded-[13px] *:data-[slot=avatar]:size-11.5 [&>div]:min-w-0 [&>div]:flex-1 [&>div]:pb-2.5 [&>div]:border-b [&_p]:overflow-hidden [&_p]:whitespace-nowrap [&_p]:text-ellipsis [&_p]:text-muted-foreground [&_p]:text-[13px] [&_p]:leading-5.75 [&_p]:relative [&_p]:pr-4.5 **:data-[slot=status]:text-[11px] **:data-[slot=status]:gap-1.25 **:data-[slot=status]:leading-4.5 [&_[data-slot=status]>i]:size-1.5 max-[800.001px]:gap-2 max-[800.001px]:px-1.5 max-[800.001px]:*:data-[slot=avatar]:size-8.75 max-[800.001px]:*:data-[slot=avatar]:text-[12px] max-[800.001px]:[&_p]:text-[11px] max-[800.001px]:**:data-[slot=status]:text-[9px] max-[650.001px]:*:data-[slot=avatar]:size-11 max-[650.001px]:[&_p]:text-[13px] max-[650.001px]:**:data-[slot=status]:text-[11px]",
              conversation?._id === item._id &&
                "bg-muted pb-2.5 [&>div]:border-0 [&>div]:pb-0",
            )}
            key={item._id}
            onClick={() => {
              setMobileChat(true);
              if (window.innerWidth <= 650) setDetails(false);
              navigate(href({ conversation: item._id }));
            }}
          >
            <Avatar initials={initials(item.customerName)} />
            <div>
              <div
                data-visual="conversation-name"
                className="flex justify-between items-center gap-2 [&>strong]:text-[15px] [&>strong]:font-medium max-[800.001px]:[&>strong]:text-[13px] max-[650.001px]:[&>strong]:text-[15px]"
              >
                <strong>{item.customerName}</strong>
                <small className="text-[12px] text-muted-foreground">
                  {time(item.updatedAt)}
                </small>
              </div>
              <p>{item.subject}</p>
              <Status color={colors[item.status]}>
                {item.agentId === user.uid && item.status === "active"
                  ? "Você está atendendo"
                  : names[item.status]}
              </Status>
            </div>
          </button>
        ))}
        {!list.items.length && (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhum atendimento encontrado.
          </p>
        )}
        {list.nextCursor && (
          <Link
            className="block p-3 text-primary text-xs"
            href={href({ cursor: JSON.stringify(list.nextCursor) })}
          >
            Próxima página
          </Link>
        )}
      </aside>
      <section
        data-visual="agent-chat"
        className="min-w-0 flex flex-col min-h-0 max-[800.001px]:group-data-[details=false]/console:min-w-90 max-[650.001px]:hidden max-[650.001px]:col-start-2 max-[650.001px]:group-data-[mobile-chat=true]/console:flex max-[650.001px]:group-data-[mobile-chat=true]/console:min-w-0"
      >
        <header
          data-visual="agent-chat-header"
          className="h-16 min-h-16 flex items-center px-5 gap-3 border-b border-border *:data-[slot=avatar]:size-10 max-[800.001px]:px-3 max-[800.001px]:gap-1.75 max-[800.001px]:*:data-[slot=avatar]:size-8 max-[800.001px]:*:data-[slot=avatar]:text-[12px] max-[650.001px]:h-19.5 max-[650.001px]:min-h-19.5 max-[650.001px]:flex-wrap max-[650.001px]:p-2 max-[650.001px]:gap-1.25"
        >
          <button
            data-visual="mobile-back"
            className="cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 disabled:cursor-default hidden max-[650.001px]:block max-[650.001px]:text-[28px] max-[650.001px]:leading-none"
            aria-label="Voltar para conversas"
            onClick={() => setMobileChat(false)}
          >
            ‹
          </button>
          <Avatar initials={initials(conversation?.customerName || "?")} />
          <div
            data-visual="agent-person"
            className="flex flex-col whitespace-nowrap [&>strong]:text-[15px] [&>strong]:font-semibold [&>small]:text-[12px] max-[800.001px]:whitespace-normal max-[800.001px]:[&>strong]:text-[13px] max-[800.001px]:[&>small]:text-[10px] max-[650.001px]:flex-1"
          >
            <strong>
              {conversation?.customerName || "Selecione uma conversa"}
            </strong>
            <small className="text-[12px] text-muted-foreground">
              {conversation ? names[conversation.status] : "Atendimentos"}
            </small>
          </div>
          <div
            data-visual="agent-header-actions"
            className="flex items-center gap-2.5 ml-auto [&_button]:text-[13px] max-[1250.001px]:gap-0.75 max-[1250.001px]:[&>button]:px-2 max-[1250.001px]:[&>button]:text-[11px] max-[800.001px]:flex-wrap max-[800.001px]:justify-end max-[800.001px]:*:data-[slot=status]:text-[10px] max-[800.001px]:[&>button]:h-6.75 max-[800.001px]:[&>button]:text-[9px] max-[800.001px]:[&>button_svg]:size-3 max-[800.001px]:[&>div_button]:w-5 max-[650.001px]:[&>button]:px-1.25"
          >
            {assumed ? (
              <>
                <Button
                  disabled={pending}
                  variant="outline"
                  onClick={() => change("release")}
                >
                  <Bot />
                  Devolver à fila
                </Button>
                <Button
                  disabled={pending}
                  variant="destructive"
                  onClick={() => setClose(true)}
                >
                  <CircleCheck />
                  Encerrar atendimento
                </Button>
              </>
            ) : (
              conversation && (
                <Status color={colors[conversation.status]} pill>
                  {names[conversation.status]}
                </Status>
              )
            )}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Opções da conversa"
                onClick={() => setMenu(!menu)}
              >
                <MoreVertical />
              </Button>
              {menu && (
                <div
                  data-visual="dropdown"
                  className="absolute right-0 top-10.5 w-47.5 z-20 p-1.25 border border-border rounded-[10px] bg-card shadow-[0_5px_20px_#0001] [&>button]:p-2.25 [&>button]:text-left [&>button]:text-[12px] [&>button]:w-full [&>button]:rounded-md [&>button]:hover:bg-muted"
                >
                  <button
                    onClick={() => {
                      if (isMobile) setMobileDetails(!mobileDetails);
                      else setDetails(!details);
                      setMenu(false);
                    }}
                  >
                    {visibleDetails ? "Ocultar" : "Mostrar"} atendimentos
                  </button>
                  <button
                    onClick={() => {
                      setAll(true);
                      setMenu(false);
                    }}
                  >
                    Ver todos os atendimentos
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div
          data-visual="agent-transcript"
          className={cn(
            "group/transcript flex-1 min-h-0 overflow-auto scrollbar-thin bg-[#edf0f4] pt-6 px-9.75 pb-4 flex flex-col justify-end gap-3.5 max-[1250.001px]:p-6.25 max-[1250.001px]:pb-4 max-[800.001px]:p-4.5 max-[800.001px]:pb-4 max-[540.001px]:justify-start max-[650.001px]:justify-start max-[650.001px]:py-4 max-[650.001px]:px-3",
            assumed && "gap-3.75 min-[1500px]:pt-6.25",
          )}
          data-assumed={assumed}
        >
          {older && (
            <Link
              className="text-primary text-xs"
              href={href({ before: null })}
            >
              Voltar às mensagens recentes
            </Link>
          )}
          {history?.nextCursor && (
            <Link
              className="text-primary text-xs"
              href={href({ before: JSON.stringify(history.nextCursor) })}
            >
              Mensagens anteriores
            </Link>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div
            data-visual="day-divider"
            className="text-center mb-1.5 [&>span]:bg-[#ffffffda] [&>span]:py-1 [&>span]:px-2.75 [&>span]:rounded-[99px] [&>span]:text-[12px] [&>span]:text-muted-foreground group-data-[assumed=true]/transcript:hidden"
          >
            <span>
              {conversation ? date(conversation.createdAt) : "Conversas"}
            </span>
          </div>
          {history?.items.map((message) => (
            <AgentMessage
              key={message._id}
              text={message.text}
              time={time(message.createdAt)}
              from={message.role === "chat" ? "user" : "agent"}
              author={message.authorName}
            />
          ))}
          {!history?.items.length && (
            <p className="text-sm text-muted-foreground">
              {conversation
                ? "Envie uma mensagem para começar."
                : "Selecione um atendimento para acompanhar a conversa."}
            </p>
          )}
        </div>
        <footer
          data-visual="agent-composer"
          className="pt-2.75 px-5 pb-3.5 border-t border-border bg-card [&>input]:w-full [&>input]:bg-muted [&>input]:rounded-[13px] [&>input]:py-3 [&>input]:px-3.5 [&>input]:text-[14px] [&>input]:min-w-0 [&>input]:disabled:bg-[#f9fafb] [&>form]:flex [&>form]:gap-3 [&>form]:items-center [&>form>input]:w-full [&>form>input]:bg-muted [&>form>input]:rounded-[13px] [&>form>input]:py-3 [&>form>input]:px-3.5 [&>form>input]:text-[14px] [&>form>input]:min-w-0 [&>form>input]:flex-1 max-[800.001px]:p-2.5"
        >
          {!canReply ? (
            <>
              <div
                data-visual="takeover-bar"
                className="flex items-center gap-3 mb-2.5 [&>div]:mr-auto [&_strong]:text-[14px] [&_strong]:font-semibold [&_strong]:block [&_strong]:whitespace-nowrap [&_small]:block [&_button]:text-[13px] max-[1250.001px]:flex-wrap max-[1250.001px]:gap-1.75 max-[1250.001px]:[&>div]:flex-1 max-[1250.001px]:[&_button]:flex-1 max-[800.001px]:[&_strong]:text-[12px] max-[800.001px]:[&_small]:text-[10px] max-[650.001px]:[&>div]:min-w-37.5"
              >
                <span
                  data-visual="hand-icon"
                  className="grid place-items-center bg-[#fff7e6] rounded-full size-9 shrink-0 text-[#a76d00]"
                >
                  <Hand size={18} />
                </span>
                <div>
                  <strong>
                    {closed
                      ? "Atendimento encerrado"
                      : conversation?.agentName
                        ? `Em atendimento por ${conversation.agentName}`
                        : "Aguardando atendente"}
                  </strong>
                  <small className="text-[12px] text-muted-foreground">
                    {closed
                      ? "O histórico será mantido."
                      : "Acompanhe a conversa"}
                  </small>
                </div>
                {conversation?.status === "waiting" && (
                  <Button disabled={pending} onClick={() => change("assume")}>
                    <Headset />
                    Assumir atendimento
                  </Button>
                )}
              </div>
              <Input
                unstyled
                disabled
                placeholder="Assuma o atendimento para responder"
              />
            </>
          ) : (
            <form noValidate onSubmit={send}>
              <Input
                unstyled
                aria-label="Mensagem"
                placeholder="Escreva sua resposta..."
                {...messageForm.register("text")}
                aria-invalid={!!messageForm.formState.errors.text}
                aria-describedby={
                  messageForm.formState.errors.text
                    ? "message-error"
                    : undefined
                }
                maxLength={8000}
                required
              />
              <Button
                data-visual="send-circle"
                type="submit"
                size="icon"
                aria-label="Enviar mensagem"
                disabled={pending || !text.trim()}
                className="rounded-full size-11 shrink-0 [&_svg]:size-4.75"
              >
                <Send />
              </Button>
            </form>
          )}
          <FieldError
            id="message-error"
            className="mt-1.5 text-red-700"
            errors={[messageForm.formState.errors.text]}
          />
        </footer>
      </section>
      {visibleDetails && (
        <aside
          data-visual="ticket-sidebar"
          className="border-l border-border flex flex-col min-h-0 [&>header]:h-16 [&>header]:flex [&>header]:justify-between [&>header]:items-center [&>header]:px-5 [&>header]:border-b [&>header]:shrink-0 [&>header_strong]:font-semibold [&>header_strong]:text-[15px] [&>header_small]:block [&_h3]:text-[12px] [&_h3]:text-muted-foreground [&_h3]:font-medium [&_h3]:mb-2.5 max-[1250.001px]:fixed max-[1250.001px]:right-0 max-[1250.001px]:top-16 max-[1250.001px]:bottom-0 max-[1250.001px]:w-80 max-[1250.001px]:bg-card max-[1250.001px]:z-25 max-[1250.001px]:shadow-[-5px_0_25px_#0001] max-[800.001px]:w-75 max-[540.001px]:top-0 max-[540.001px]:w-[calc(100%-48px)] max-[650.001px]:hidden max-[650.001px]:group-data-[mobile-chat=true]/console:flex max-[650.001px]:group-data-[mobile-chat=true]/console:w-[calc(100%-48px)] max-[650.001px]:group-data-[mobile-chat=true]/console:top-16"
        >
          <header>
            <div>
              <strong>Atendimentos</strong>
              <small className="text-[12px] text-muted-foreground">
                {conversation?.customerName || "Detalhes da conversa"}
              </small>
            </div>
            <button
              aria-label="Fechar painel de atendimentos"
              onClick={() => setDetails(false)}
            >
              <X size={18} />
            </button>
          </header>
          <div
            data-visual="ticket-sidebar-content"
            className="py-5.5 px-4.75 overflow-auto"
          >
            <h3>Desta conversa</h3>
            {conversation && (
              <div
                data-visual="current-ticket"
                className="rounded-[14px] bg-muted py-3.5 px-4 mb-7.5 [&>div]:flex [&>div]:items-center [&>div]:justify-between [&>div]:gap-1.25 [&>div]:mb-1 [&>strong]:text-[15px] [&>strong]:leading-5.5 [&>strong]:font-medium [&>p]:text-[13px] [&>p]:text-muted-foreground [&>p]:mt-0.5 [&>footer]:flex [&>footer]:gap-2 [&>footer]:items-center [&>footer]:border-t [&>footer]:mt-3.25 [&>footer]:pt-2.75 [&>footer]:text-[12px] [&>footer]:text-[#435066] [&>footer>small]:ml-auto"
              >
                <div>
                  <small className="text-[12px] text-muted-foreground">
                    {date(conversation.createdAt)}
                  </small>
                  <Status color={colors[conversation.status]}>
                    {names[conversation.status]}
                  </Status>
                </div>
                <strong>{conversation.subject}</strong>
                <p>{conversation.customerName}</p>
                <footer>
                  <Headset size={14} />
                  <span>
                    {conversation.agentName || "Aguardando um atendente"}
                  </span>
                  <small className="text-[12px] text-muted-foreground">
                    {time(conversation.updatedAt)}
                  </small>
                </footer>
              </div>
            )}
            <h3>Outros atendimentos</h3>
            {list.items
              .filter(
                (item) =>
                  item.customerId === conversation?.customerId &&
                  item._id !== conversation?._id,
              )
              .map((item) => (
                <button
                  data-visual="other-ticket"
                  className="cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 disabled:cursor-default flex items-center gap-2.75 text-left w-full py-3.5 border-b border-border last:border-0 [&>i]:size-1.75 [&>i]:rounded-full [&>i]:shrink-0 [&>div]:flex-1 [&_strong]:block [&_strong]:text-[14px] [&_strong]:font-normal [&_strong]:leading-5.25 [&_small]:block [&>svg]:text-muted-foreground"
                  key={item._id}
                  onClick={() => {
                    navigate(href({ conversation: item._id }));
                  }}
                >
                  <i className="bg-[#0785ff]" />
                  <div>
                    <strong>{item.subject}</strong>
                    <small className="text-[12px] text-muted-foreground">
                      {names[item.status]}
                    </small>
                  </div>
                  <ChevronRight size={16} />
                </button>
              ))}
          </div>
          <Button
            data-visual="all-tickets"
            className="mt-auto mx-3.75 mb-3.75 text-[13px] text-[#344156]"
            variant="outline"
            onClick={() => setAll(true)}
          >
            Ver todos os atendimentos <ArrowUpRight />
          </Button>
        </aside>
      )}
      <Dialog open={close} onOpenChange={setClose} title="Encerrar atendimento">
        <p className="mb-5 text-sm text-muted-foreground">
          Deseja encerrar esta conversa? O histórico será mantido.
        </p>
        <Button
          disabled={pending}
          variant="destructive"
          onClick={() => {
            change("close");
            setClose(false);
          }}
        >
          Encerrar atendimento
        </Button>
      </Dialog>
      <Dialog open={all} onOpenChange={setAll} title="Atendimentos">
        <ConversationFilters role={user.role} search={search} status={status} />
        {list.items.map((item) => (
          <Link
            key={item._id}
            href={href({ conversation: item._id })}
            className="block py-3 border-b"
          >
            <strong className="block text-sm">{item.subject}</strong>
            <small className="text-[12px] text-muted-foreground">
              {item.customerName} · {names[item.status]}
            </small>
          </Link>
        ))}
        {list.nextCursor && (
          <Link
            className="block p-3 text-primary text-xs"
            href={href({ cursor: JSON.stringify(list.nextCursor) })}
          >
            Próxima página
          </Link>
        )}
      </Dialog>
    </main>
  );
}
function AgentMessage({
  text,
  time,
  from,
  author,
}: {
  text: string;
  time: string;
  from: string;
  author: string;
}) {
  return (
    <div
      data-visual="agent-message"
      data-from={from}
      className="group/message shrink-0 max-w-full self-start [[data-from=user]+&[data-from=user]]:-mt-2.75 data-[from=ai]:self-end data-[from=ai]:max-w-105.5 data-[from=agent]:self-end data-[from=agent]:max-w-105.5 group-data-[assumed=true]/transcript:data-[from=ai]:mt-px max-[650.001px]:data-[from=ai]:max-w-[95%] max-[650.001px]:data-[from=agent]:max-w-[95%]"
    >
      {from !== "user" && (
        <div
          data-visual="message-author"
          className="flex items-center justify-end gap-1.75 text-[11px] font-medium mb-1 pr-1.5 [&>span]:bg-[#dcebf9] [&>span]:text-primary [&>span]:rounded [&>span]:px-1.25 [&>span]:text-[10px] group-data-[from=agent]/message:[&>span]:bg-[#d9f0e3] group-data-[from=agent]/message:[&>span]:text-[#008557]"
        >
          {from === "ai" ? "Nexo Assist" : author}
          <span>{from === "ai" ? "IA" : "Atendente"}</span>
        </div>
      )}
      <div
        data-visual="message-bubble"
        className="flow-root whitespace-pre-wrap wrap-break-word bg-card rounded-[4px_13px_13px_13px] py-2 px-3 text-[14px] shadow-[0_1px_2px_#23304708] group-data-[from=ai]/message:bg-[#e5effb] group-data-[from=ai]/message:rounded-[13px_4px_13px_13px] group-data-[from=ai]/message:min-w-0 group-data-[from=agent]/message:bg-[#e2f3e9] group-data-[from=agent]/message:rounded-[13px_4px_13px_13px] max-[800.001px]:text-[12px] max-[800.001px]:leading-4.75"
      >
        <span>{text}</span>
        <span
          data-visual="message-time"
          className="inline-flex items-center justify-end gap-1 text-[10px] text-muted-foreground ml-2.5 float-right mt-0.75 [&>svg]:text-[#0088ff] group-data-[from=ai]/message:flex group-data-[from=ai]/message:float-none group-data-[from=ai]/message:mt-0 group-data-[from=ai]/message:leading-4 group-data-[from=agent]/message:flex group-data-[from=agent]/message:float-none group-data-[from=agent]/message:mt-0 group-data-[from=agent]/message:leading-4 group-[[data-from=ai]:nth-child(3)]/message:inline-flex group-[[data-from=ai]:nth-child(3)]/message:float-right group-[[data-from=ai]:nth-child(3)]/message:mt-0.75"
        >
          {time}
          {from !== "user" && <CheckCheck size={14} />}
        </span>
      </div>
    </div>
  );
}
