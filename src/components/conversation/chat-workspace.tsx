"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowUp, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field";
import { ConversationFilters } from "./conversation-filters";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Status } from "@/components/status";
import {
  useConversationWorkspace,
  type WorkspaceProps,
} from "./use-conversation-workspace";

const names = {
  waiting: "Aguardando atendente",
  active: "Em atendimento",
  closed: "Encerrado",
};

const colors = { waiting: "amber", active: "blue", closed: "gray" };

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

export function ChatWorkspace(props: WorkspaceProps) {
  const { user, list, conversation, history, search, status, older } = props;
  const {
    pending,
    error,
    streamMessages,
    text,
    messageForm,
    createForm,
    setCreationId,
    href,
    create,
    send,
    canReply,
    navigate,
  } = useConversationWorkspace(props);
  const visibleMessages = [
    ...(history?.items ?? []),
    ...streamMessages.filter(
      (message) => !history?.items.some((saved) => saved._id === message._id),
    ),
  ];
  const [mode, setMode] = useState<"new" | "consult">(
    conversation ? "consult" : "new",
  );

  return (
    <main
      data-visual="customer-chat"
      className={cn(
        "group/chat max-w-202 mx-auto relative h-[calc(100dvh-64px)] flex flex-col pt-18.25 max-[1250.001px]:mx-8 max-[1250.001px]:max-w-none max-[800.001px]:mx-5 max-[800.001px]:pt-11.25 max-[540.001px]:h-[calc(100dvh-58px)] max-[540.001px]:mx-3 max-[540.001px]:pt-10.5",
        mode === "consult" && "pt-13.5",
      )}
      data-mode={mode}
    >
      <div
        data-visual="chat-tools"
        className="absolute top-4 right-0 flex gap-3 text-muted-foreground text-2.75 opacity-0 transition-opacity duration-200 group-hover/chat:opacity-100 focus-within:opacity-100 [&>button]:flex [&>button]:items-center [&>button]:gap-0.75 max-[800.001px]:opacity-100 max-[800.001px]:top-3"
      >
        <button
          onClick={() => {
            setMode("new");
            if (conversation)
              navigate(href({ conversation: null, before: null }));
          }}
        >
          <Plus size={13} />
          Novo atendimento
        </button>
        <button onClick={() => setMode("consult")}>
          Consultar atendimentos
        </button>
      </div>
      <div
        data-visual="customer-transcript"
        className="flex-1 min-h-0 overflow-auto scrollbar-thin pt-4.75 max-[540.001px]:pt-2"
      >
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {mode === "new" ? (
          <>
            <div
              data-visual="assistant-group"
              className="mb-4.75 max-[540.001px]:mb-3.75"
            >
              <div
                data-visual="assistant-bubble"
                className="max-w-150.25 border border-border rounded-[4px_13px_13px_13px] py-3 px-3.75 leading-5.5 [&>strong]:block [&>strong]:mt-2.5 [&>strong]:mb-2 [&>strong]:font-semibold group-data-[mode=new]/chat:py-2.5 max-[800.001px]:text-[13px] max-[540.001px]:p-2.5 max-[540.001px]:text-[12px] max-[540.001px]:leading-5"
              >
                <p>Como podemos ajudar?</p>
                <strong>Inicie um atendimento com a equipe de TI.</strong>
              </div>
              <section
                data-visual="ticket-card"
                className="mt-1.25 [&_h2]:text-[18px] [&_h2]:leading-6.25 [&_h2]:font-semibold [&_h2]:tracking-[-0.3px] [&_h2]:mb-1.25 [&_p]:text-[13px] [&_p]:text-[#425069] [&_p]:leading-5.25 max-[800.001px]:[&_h2]:text-[16px] max-[800.001px]:[&_p]:text-[12px] max-[540.001px]:[&_h2]:text-3.75 max-[540.001px]:[&_h2]:leading-5.25 overflow-hidden rounded-4.25 border border-border bg-card shadow-[0_1px_2px_#18233408,0_5px_14px_#18233403]"
              >
                <div
                  data-visual="ticket-body"
                  className="py-3.5 px-4.25 max-[540.001px]:p-3"
                >
                  <form onSubmit={create} noValidate>
                    <Label
                      htmlFor="subject"
                      className="block text-[13px] mb-1.5"
                    >
                      Novo atendimento
                    </Label>
                    <Input
                      unstyled
                      id="subject"
                      className="w-full border border-border rounded-lg p-2.5 text-[14px]"
                      {...createForm.register("subject", {
                        onChange: () => setCreationId(null),
                      })}
                      aria-invalid={!!createForm.formState.errors.subject}
                      aria-describedby={
                        createForm.formState.errors.subject
                          ? "subject-error"
                          : undefined
                      }
                      minLength={3}
                      maxLength={160}
                      required
                      placeholder="Descreva o assunto do atendimento"
                    />
                    <FieldError
                      id="subject-error"
                      className="mt-1.5 text-red-700"
                      errors={[createForm.formState.errors.subject]}
                    />
                    <div className="flex gap-2 mt-4">
                      <Button type="submit" disabled={pending}>
                        Iniciar atendimento
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setMode("consult")}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                </div>
              </section>
            </div>
          </>
        ) : (
          <>
            <div
              data-visual="assistant-group"
              className="mb-4.75 max-[540.001px]:mb-3.75"
            >
              <div
                data-visual="assistant-bubble"
                className="max-w-150.25 border border-border rounded-[4px_13px_13px_13px] py-3 px-3.75 leading-5.5 [&>strong]:block [&>strong]:mt-2.5 [&>strong]:mb-2 [&>strong]:font-semibold group-data-[mode=new]/chat:py-2.5 max-[800.001px]:text-[13px] max-[540.001px]:p-2.5 max-[540.001px]:text-[12px] max-[540.001px]:leading-5"
              >
                <p>
                  Seus atendimentos. Selecione uma conversa para acompanhar.
                </p>
              </div>
              <div
                data-visual="ticket-list"
                className="mt-1.25 [&>button]:w-full [&>button]:flex [&>button]:items-center [&>button]:text-left [&>button]:gap-3.5 [&>button]:py-3 [&>button]:px-4 [&>button]:min-h-11.25 [&>button+button]:border-t **:data-[slot=status]:text-[12px] **:data-[slot=status]:text-muted-foreground [&_small:last-child]:ml-2 max-[800.001px]:[&>button]:flex-wrap max-[800.001px]:[&>button]:gap-1.75 max-[800.001px]:**:data-[slot=status]:ml-5.75 max-[800.001px]:[&_small:last-child]:ml-auto max-[540.001px]:[&>button]:p-2.5 max-[540.001px]:[&_small]:text-[10px] overflow-hidden rounded-4.25 border border-border bg-card shadow-[0_1px_2px_#18233408,0_5px_14px_#18233403]"
              >
                {list.items.map((item) => (
                  <button
                    key={item._id}
                    className={cn(
                      "cursor-pointer",
                      item._id === conversation?._id && "bg-[#f4f9ff]",
                    )}
                    onClick={() => {
                      navigate(href({ conversation: item._id }));
                    }}
                  >
                    <span className="border-[1.5px] border-[#cdd2d8] size-4 rounded-full shrink-0" />
                    <span
                      data-visual="ticket-list-title"
                      className="flex-1 max-[800.001px]:basis-[65%] max-[800.001px]:text-[13px] max-[540.001px]:basis-[55%] max-[540.001px]:text-[12px]"
                    >
                      {item.subject}
                    </span>
                    <Status color={colors[item.status]}>
                      {item.aiEnabled &&
                      !item.aiHandoff &&
                      item.status === "waiting"
                        ? "Nexo Assist"
                        : names[item.status]}
                    </Status>
                    <small className="text-[12px] text-muted-foreground">
                      {date(item.createdAt)}
                    </small>
                  </button>
                ))}
                {!list.items.length && (
                  <p className="p-4 text-sm">Nenhum atendimento encontrado.</p>
                )}
              </div>
              {list.nextCursor && (
                <Link
                  className="block p-3 text-primary text-xs"
                  href={href({ cursor: JSON.stringify(list.nextCursor) })}
                >
                  Próxima página
                </Link>
              )}
              <details className="mt-3 text-muted-foreground">
                <summary className="text-xs cursor-pointer">
                  Pesquisar e filtrar
                </summary>
                <ConversationFilters
                  role={user.role}
                  search={search}
                  status={status}
                />
              </details>
            </div>
            {conversation && (
              <>
                <div
                  data-visual="assistant-group"
                  className="mb-4.75 max-[540.001px]:mb-3.75"
                >
                  <section
                    data-visual="ticket-card"
                    className="mt-1.25 [&_h2]:text-[18px] [&_h2]:leading-6.25 [&_h2]:font-semibold [&_h2]:tracking-[-0.3px] [&_h2]:mb-1.25 [&_p]:text-[13px] [&_p]:text-[#425069] [&_p]:leading-5.25 max-[800.001px]:[&_h2]:text-[16px] max-[800.001px]:[&_p]:text-[12px] max-[540.001px]:[&_h2]:text-3.75 max-[540.001px]:[&_h2]:leading-5.25 overflow-hidden rounded-4.25 border border-border bg-card shadow-[0_1px_2px_#18233408,0_5px_14px_#18233403]"
                  >
                    <div
                      data-visual="ticket-body"
                      className="py-3.5 px-4.25 max-[540.001px]:p-3"
                    >
                      <div
                        data-visual="ticket-meta"
                        className="flex justify-between items-center text-[12px] text-muted-foreground mb-1.5 max-[800.001px]:flex-wrap max-[800.001px]:gap-1.25 max-[540.001px]:text-[10px] max-[540.001px]:*:data-[slot=status]:text-[10px]"
                      >
                        <span>Atendimento</span>
                        <Status color={colors[conversation.status]}>
                          {conversation.aiEnabled &&
                          !conversation.aiHandoff &&
                          conversation.status === "waiting"
                            ? "Nexo Assist"
                            : names[conversation.status]}
                        </Status>
                      </div>
                      <h2>{conversation.subject}</h2>
                      <p>
                        {conversation.agentName ||
                          (conversation.aiEnabled && !conversation.aiHandoff
                            ? "Atendimento com Nexo Assist"
                            : "Aguardando um atendente")}
                      </p>
                    </div>
                  </section>
                </div>
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
                {visibleMessages.map((message) =>
                  message.role === "chat" ? (
                    <div
                      data-visual="customer-bubble"
                      className="ml-auto mb-4.75 w-fit max-w-130 bg-[#1c2633] text-white py-3 px-4 rounded-[12px_12px_3px_12px] leading-5.25 min-h-10.75 group-data-[mode=new]/chat:w-130 max-[800.001px]:max-w-[90%] max-[800.001px]:group-data-[mode=new]/chat:w-fit max-[540.001px]:text-[12px] max-[540.001px]:leading-4.75 max-[540.001px]:mb-3.75 min-[801px]:group-data-[mode=new]/chat:nth-3:pr-15"
                      key={message._id}
                    >
                      <p className="whitespace-pre-wrap wrap-break-word">
                        {message.text}
                      </p>
                      <small className="text-[10px] opacity-70">
                        {time(message.createdAt)}
                      </small>
                    </div>
                  ) : (
                    <div
                      data-visual="assistant-group"
                      className="mb-4.75 max-[540.001px]:mb-3.75"
                      key={message._id}
                    >
                      <p className="mb-1 text-[11px] text-muted-foreground">
                        {message.authorName}
                      </p>
                      <div
                        data-visual="assistant-bubble"
                        className="max-w-150.25 border border-border rounded-[4px_13px_13px_13px] py-3 px-3.75 leading-5.5 [&>strong]:block [&>strong]:mt-2.5 [&>strong]:mb-2 [&>strong]:font-semibold group-data-[mode=new]/chat:py-2.5 max-[800.001px]:text-[13px] max-[540.001px]:p-2.5 max-[540.001px]:text-[12px] max-[540.001px]:leading-5"
                      >
                        <p className="whitespace-pre-wrap wrap-break-word">
                          {message.text}
                        </p>
                        <small className="text-[10px] text-muted-foreground">
                          {time(message.createdAt)}
                        </small>
                      </div>
                    </div>
                  ),
                )}
                {!visibleMessages.length && (
                  <p className="text-sm text-muted-foreground">
                    Envie uma mensagem para começar.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
      <form
        data-visual="customer-composer"
        className="pb-4 bg-card [&>div]:flex [&>div]:items-center [&>div]:p-1.25 [&>div]:border [&>div]:border-[#dfe2e7] [&>div]:rounded-[13px] [&>div]:min-h-12.25 [&_input]:flex-1 [&_input]:min-w-0 [&_input]:py-1.75 [&_input]:px-2.5 [&_input]:text-[14px] [&_input]:placeholder:text-muted-foreground [&>small]:block [&>small]:text-right [&>small]:mt-1 max-[540.001px]:[&_input]:text-[12px] max-[540.001px]:[&_input]:pl-1.5 max-[540.001px]:[&_button]:text-[12px] max-[540.001px]:[&_button]:px-2.25 max-[540.001px]:[&>small]:text-[10px]"
        noValidate
        onSubmit={send}
      >
        <div>
          <Input
            unstyled
            id="chat-input"
            aria-label="Mensagem"
            placeholder="Escreva para o Nexo..."
            {...messageForm.register("text")}
            aria-invalid={!!messageForm.formState.errors.text}
            aria-describedby={
              messageForm.formState.errors.text ? "message-error" : undefined
            }
            maxLength={8000}
            required
            disabled={!canReply || mode === "new"}
          />
          <Button
            type="submit"
            aria-label="Enviar mensagem"
            disabled={pending || !canReply || mode === "new" || !text.trim()}
          >
            <ArrowUp />
            Enviar
          </Button>
        </div>
        {messageForm.formState.errors.text && (
          <section>
            <FieldError
              id="message-error"
              className="mt-1.5 text-red-700"
              errors={[messageForm.formState.errors.text]}
            />
          </section>
        )}
        <small className="text-[12px] text-muted-foreground">
          {conversation?.status === "closed"
            ? "Este atendimento foi encerrado. O histórico foi preservado."
            : "Seu histórico de atendimento é mantido nesta conversa."}
        </small>
      </form>
    </main>
  );
}
