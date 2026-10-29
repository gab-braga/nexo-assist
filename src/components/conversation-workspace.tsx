"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createConversation,
  sendMessage,
  transitionConversation,
} from "@/server/actions/conversations";
import { Button } from "@/components/ui/button";
import type { ConversationDTO, MessageDTO, SessionUser } from "@/types/domain";
import type {
  listConversations,
  getMessages,
} from "@/server/services/conversations";

const statusNames = {
  waiting: "Aguardando atendente",
  active: "Em atendimento",
  closed: "Encerrado",
};
type Props = {
  user: SessionUser;
  list: Awaited<ReturnType<typeof listConversations>>;
  conversation: ConversationDTO | null;
  history: Awaited<ReturnType<typeof getMessages>> | null;
  search: string;
  status: string;
  older: boolean;
};
const field = "w-full rounded-lg border border-border bg-card p-3 text-sm";

export function ConversationWorkspace({
  user,
  list,
  conversation,
  history,
  search,
  status,
  older,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [request, setRequest] = useState<{
    id: string;
    text: string;
    conversationId: string;
  } | null>(null);
  const [creationId, setCreationId] = useState<string | null>(null);
  const base = user.role === "agent" ? "/agent" : "/chat";
  function href(changes: Record<string, string | null>) {
    const params = new URLSearchParams({ search, status });
    if (conversation) params.set("conversation", conversation._id);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    return `${base}?${params}`;
  }
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && !pending && !older)
        startTransition(() => router.refresh());
    }, 10000);
    return () => clearInterval(timer);
  }, [router, pending, older]);
  function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const id = creationId ?? crypto.randomUUID();
    setCreationId(id);
    startTransition(async () => {
      const result = await createConversation({ requestId: id, subject });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSubject("");
      setCreationId(null);
      router.push(href({ conversation: result.data._id, cursor: null }));
    });
  }
  function send(event: React.FormEvent) {
    event.preventDefault();
    if (!conversation) return;
    setError("");
    const next =
      request?.text === text && request.conversationId === conversation._id
        ? request
        : { id: crypto.randomUUID(), text, conversationId: conversation._id };
    setRequest(next);
    startTransition(async () => {
      const result = await sendMessage({
        requestId: next.id,
        text: next.text,
        conversationId: next.conversationId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setText("");
      setRequest(null);
      router.refresh();
    });
  }
  function change(operation: "assume" | "release" | "close") {
    if (!conversation) return;
    if (
      operation === "close" &&
      !window.confirm("Encerrar este atendimento? O histórico será preservado.")
    )
      return;
    setError("");
    startTransition(async () => {
      const result = await transitionConversation({
        conversationId: conversation._id,
        version: conversation.version,
        operation,
      });
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }
  const canReply =
    conversation &&
    conversation.status !== "closed" &&
    (user.role === "chat" || conversation.agentId === user.uid);
  return (
    <main className="mx-auto max-w-7xl p-4 md:p-8">
      <h1 className="mb-6 text-2xl font-semibold">
        {user.role === "agent"
          ? "Central de atendimentos"
          : "Meus atendimentos"}
      </h1>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          {user.role === "chat" && (
            <form
              onSubmit={create}
              className="space-y-3 rounded-xl border bg-card p-4"
            >
              <label htmlFor="subject">Novo atendimento</label>
              <input
                id="subject"
                className={field}
                value={subject}
                minLength={3}
                maxLength={160}
                required
                onChange={(event) => {
                  setSubject(event.target.value);
                  setCreationId(null);
                }}
                placeholder="Como podemos ajudar?"
              />
              <Button disabled={pending} type="submit">
                Iniciar atendimento
              </Button>
            </form>
          )}
          <form action={base} className="space-y-3">
            <input
              aria-label="Pesquisar atendimentos"
              className={field}
              name="search"
              defaultValue={search}
              maxLength={100}
              placeholder="Pesquisar assunto ou cliente"
            />
            <select
              aria-label="Filtrar atendimentos"
              className={field}
              name="status"
              defaultValue={status}
            >
              <option value="all">Todos</option>
              <option value="waiting">Aguardando</option>
              <option value="active">Em atendimento</option>
              <option value="closed">Encerrados</option>
              {user.role === "agent" && (
                <option value="mine">Meus atendimentos</option>
              )}
            </select>
            <Button variant="outline" type="submit">
              Filtrar
            </Button>
          </form>
          <nav aria-label="Atendimentos" className="space-y-2">
            {list.items.map((item) => (
              <Link
                key={item._id}
                href={href({ conversation: item._id })}
                className={`block rounded-xl border p-4 ${item._id === conversation?._id ? "border-primary bg-secondary" : "bg-card"}`}
              >
                <strong className="block break-words">{item.subject}</strong>
                {user.role === "agent" && (
                  <span className="block text-sm">{item.customerName}</span>
                )}
                <span className="text-xs text-muted-foreground">
                  {statusNames[item.status]}
                </span>
              </Link>
            ))}
            {!list.items.length && <p>Nenhum atendimento encontrado.</p>}
            {list.nextCursor && (
              <Link
                className="block text-primary"
                href={href({ cursor: JSON.stringify(list.nextCursor) })}
              >
                Próxima página
              </Link>
            )}
          </nav>
        </aside>
        <section
          aria-label="Conversa"
          className="min-w-0 rounded-xl border bg-card p-4 md:p-6"
        >
          {!conversation ? (
            <p>Selecione um atendimento para acompanhar a conversa.</p>
          ) : (
            <>
              <header className="mb-5 space-y-3 border-b pb-4">
                <h2 className="break-words text-xl font-medium">
                  {conversation.subject}
                </h2>
                <p>
                  {statusNames[conversation.status]}
                  {conversation.agentName ? ` · ${conversation.agentName}` : ""}
                </p>
                {user.role === "agent" && (
                  <div className="flex flex-wrap gap-2">
                    {conversation.status === "waiting" && (
                      <Button
                        disabled={pending}
                        onClick={() => change("assume")}
                      >
                        Assumir atendimento
                      </Button>
                    )}
                    {conversation.status === "active" &&
                      conversation.agentId === user.uid && (
                        <>
                          <Button
                            disabled={pending}
                            variant="outline"
                            onClick={() => change("release")}
                          >
                            Devolver à fila
                          </Button>
                          <Button
                            disabled={pending}
                            variant="destructive"
                            onClick={() => change("close")}
                          >
                            Encerrar atendimento
                          </Button>
                        </>
                      )}
                  </div>
                )}
              </header>
              {older && (
                <Link className="text-primary" href={href({ before: null })}>
                  Voltar às mensagens recentes
                </Link>
              )}
              {history?.nextCursor && (
                <Link
                  className="mb-4 block text-primary"
                  href={href({ before: JSON.stringify(history.nextCursor) })}
                >
                  Mensagens anteriores
                </Link>
              )}
              <ol
                aria-label="Mensagens"
                className="max-h-[55vh] space-y-4 overflow-y-auto py-4"
              >
                {history?.items.map((message: MessageDTO) => (
                  <li
                    key={message._id}
                    className={`max-w-[90%] rounded-xl p-3 ${message.authorId === user.uid ? "ml-auto bg-secondary" : "bg-muted"}`}
                  >
                    <strong className="text-xs">{message.authorName}</strong>
                    <p className="whitespace-pre-wrap break-words">
                      {message.text}
                    </p>
                    <time
                      className="text-xs text-muted-foreground"
                      dateTime={message.createdAt}
                    >
                      {new Date(message.createdAt).toLocaleString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      })}
                    </time>
                  </li>
                ))}
              </ol>
              {!history?.items.length && (
                <p className="py-6 text-muted-foreground">
                  Envie uma mensagem para começar.
                </p>
              )}
              {canReply ? (
                <form onSubmit={send} className="mt-4 space-y-3 border-t pt-4">
                  <textarea
                    aria-label="Mensagem"
                    className={field}
                    value={text}
                    required
                    maxLength={8000}
                    rows={3}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Escreva sua mensagem..."
                  />
                  <Button disabled={pending || !text.trim()} type="submit">
                    Enviar mensagem
                  </Button>
                </form>
              ) : (
                <p className="mt-4 text-muted-foreground">
                  {conversation.status === "closed"
                    ? "Este atendimento foi encerrado. O histórico foi preservado."
                    : "Assuma o atendimento para responder."}
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
