"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  MessageFormSchema,
  type MessageFormValues,
} from "@/lib/schemas/conversation-forms";
import { useRouter } from "next/navigation";
import {
  sendMessage,
  transitionConversation,
  getMessages as fetchMessages,
  requestHumanSupport,
} from "@/server/actions/conversations";
import type { ConversationDTO, MessageDTO, SessionUser } from "@/types/domain";
import { AgentStreamError, consumeAgentStream } from "@/lib/agent-stream";
import { conversationTitle } from "@/lib/conversation-title";
import type {
  listConversations,
  getMessages,
} from "@/server/services/conversations";

export type WorkspaceProps = {
  analystContext?: Awaited<ReturnType<typeof import("@/server/services/conversations").getAnalystContext>> | null;
  interaction?: import("@/types/tickets").ConversationInteraction | null;
  user: SessionUser;
  list: Awaited<ReturnType<typeof listConversations>>;
  conversation: ConversationDTO | null;
  history: Awaited<ReturnType<typeof getMessages>> | null;
  search: string;
  status: string;
  older: boolean;
};

type PendingMessage = {
  id: string;
  text: string;
  conversationId: string;
  startConversation?: true;
};

export function useConversationWorkspace({
  user,
  conversation: initialConversation,
  search,
  status,
  older,
}: WorkspaceProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [, refreshTransition] = useTransition();
  const [connectionError, setConnectionError] = useState("");
  const transitionRequest = useRef<{ id: string; operation: string; conversationId: string; version: number } | null>(null);
  const handoffRequest = useRef<{ requestId: string; conversationId: string } | null>(null);
  const handoffSending = useRef(false);
  const [humanPending, setHumanPending] = useState(false);
  const [streamMessages, setStreamMessages] = useState<MessageDTO[]>([]);
  const [createdConversation, setCreatedConversation] =
    useState<ConversationDTO | null>(null);
  const [startingNew, setStartingNew] = useState(false);
  const conversation = startingNew
    ? createdConversation
    : (initialConversation ?? createdConversation);
  const messageForm = useForm<MessageFormValues>({
    resolver: zodResolver(MessageFormSchema),
    defaultValues: { text: "" },
  });
  const text = useWatch({ control: messageForm.control, name: "text" });
  const request = useRef<PendingMessage | null>(null);
  const sending = useRef(false);
  const generation = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
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
    let current = true;
    const refresh = () => {
      // A refresh would remount the newly-created route and discard a failed
      // first-send draft. Refresh it only after success or explicit navigation.
      if (document.hidden || pending || older) return;
      if (!navigator.onLine) { setConnectionError("Sem conexão. As mensagens serão atualizadas quando a conexão retornar."); return; }
      setConnectionError("");
      if (createdConversation) {
        const attempt = generation.current;
        void fetchMessages({ conversationId: createdConversation._id }).then(result => {
          if (!current || generation.current !== attempt) return;
          if (result.ok) { setCreatedConversation(result.data.conversation); setStreamMessages(result.data.items); }
          else setConnectionError(result.error);
        }).catch(() => { if (current) setConnectionError("Não foi possível atualizar o histórico. Tentaremos novamente."); });
      } else refreshTransition(() => router.refresh());
    };
    const timer = setInterval(refresh, conversation && (!conversation.aiEnabled || conversation.aiHandoff || conversation.status === "active") ? 5000 : 10000);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => { current = false; clearInterval(timer); window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh); };
  }, [router, pending, older, createdConversation, conversation]);

  function newConversation() {
    generation.current++;
    activeRequest.current?.abort();
    sending.current = false;
    request.current = null;
    handoffRequest.current = null;
    handoffSending.current = false;
    setHumanPending(false);
    setStartingNew(true);
    setCreatedConversation(null);
    setStreamMessages([]);
    setError("");
    messageForm.reset({ text: "" });
    // Show the empty composer immediately, but wait for the new route before
    // accepting input; the old conversation must never receive the next draft.
    startTransition(() => router.push(base));
  }

  function submitMessage({ text }: MessageFormValues) {
    if (sending.current || pending || (!conversation && user.role !== "chat"))
      return;
    sending.current = true; // Enter/double click can precede a React render.
    const attempt = generation.current;
    setError("");
    const next: PendingMessage =
      request.current?.text === text &&
        (!conversation || request.current.conversationId === conversation._id)
        ? request.current
        : {
          id: crypto.randomUUID(),
          text,
          conversationId: conversation?._id ?? crypto.randomUUID(),
          ...(!conversation ? { startConversation: true as const } : {}),
        };
    request.current = next;
    startTransition(async () => {
      try {
        if (
          user.role === "chat" &&
          (!conversation ||
            (conversation.aiEnabled &&
              !conversation.aiHandoff &&
              conversation.status === "waiting"))
        ) {
          const timestamp = new Date().toISOString();
          const previewId = `stream-${next.id}`;
          const controller = new AbortController();
          activeRequest.current = controller;
          let accepted = false;
          setStreamMessages([
            {
              _id: next.id,
              conversationId: next.conversationId,
              authorId: user.uid,
              authorName: user.name,
              role: "chat",
              text: next.text,
              createdAt: timestamp,
            },
            {
              _id: previewId,
              conversationId: next.conversationId,
              authorId: "nexo-assist",
              authorName: "Nexo Assist",
              role: "assistant",
              text: "Processando sua mensagem…",
              createdAt: timestamp,
            },
          ]);
          let streamed = "";
          try {
            const response = await fetch("/api/agent", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                requestId: next.id,
                conversationId: next.conversationId,
                text: next.text,
                ...(next.startConversation ? { startConversation: true } : {}),
              }),
            });
            await consumeAgentStream(response, (event) => {
              if (generation.current !== attempt) return;
              if (event.type === "started") {
                accepted = true;
                if (next.startConversation) {
                  setCreatedConversation({
                    _id: next.conversationId,
                    subject: conversationTitle(next.text),
                    customerId: user.uid,
                    customerName: user.name,
                    status: "waiting",
                    agentId: null,
                    agentName: null,
                    aiEnabled: true,
                    initialMessageId: next.id,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                    version: 1,
                  });
                  // Update Next's URL without unmounting the reader or resending on mount.
                  window.history.pushState(
                    null,
                    "",
                    href({
                      conversation: next.conversationId,
                      cursor: null,
                      before: null,
                    }),
                  );
                }
              } else if (event.type === "delta") {
                streamed += event.text;
                setStreamMessages((messages) =>
                  messages.map((message) =>
                    message._id === previewId
                      ? { ...message, text: streamed }
                      : message,
                  ),
                );
              } else if (event.type === "completed") {
                setStreamMessages((messages) =>
                  messages.map((message) =>
                    message._id === previewId ? event.message : message,
                  ),
                );
              }
            });
            if (generation.current !== attempt) return;
            messageForm.reset();
            request.current = null;
            router.refresh();
          } catch (failure) {
            if (generation.current !== attempt) return;
            setError(
              failure instanceof AgentStreamError
                ? failure.message
                : "A resposta foi interrompida. Seu texto foi preservado; tente novamente para verificar o resultado.",
            );
            setStreamMessages((messages) =>
              accepted
                ? messages.filter((message) => message.role === "chat")
                : [],
            );
            // Uncertain outcomes keep their IDs; known terminal failures allow
            // a subsequent explicit attempt, never an automatic second run.
            if (
              failure instanceof AgentStreamError &&
              ![
                "RUN_IN_PROGRESS",
                "CONFLICT",
                "PERSISTENCE_UNAVAILABLE",
                "STREAM_INTERRUPTED",
              ].includes(failure.code)
            )
              request.current = null;
            if (!next.startConversation && !createdConversation)
              router.refresh();
          }
          return;
        }
        const result = await sendMessage({
          requestId: next.id,
          text: next.text,
          conversationId: next.conversationId,
        });
        if (generation.current !== attempt) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        messageForm.reset();
        request.current = null;
        router.refresh();
      } catch {
        if (generation.current === attempt)
          setError(
            "Não foi possível enviar a mensagem. Seu texto foi preservado; tente novamente.",
          );
      } finally {
        if (generation.current === attempt) {
          sending.current = false;
          activeRequest.current = null;
        }
      }
    });
  }

  function send(event: FormEvent<HTMLFormElement>) {
    return messageForm.handleSubmit(submitMessage)(event);
  }

  function change(operation: "assume" | "release" | "return_to_ai" | "close") {
    if (!conversation) return;
    if (sending.current) return;
    sending.current = true;
    setError("");
    const next = transitionRequest.current?.conversationId === conversation._id && transitionRequest.current.operation === operation
      ? transitionRequest.current : { id: crypto.randomUUID(), operation, conversationId: conversation._id, version: conversation.version };
    transitionRequest.current = next;
    startTransition(async () => {
      try {
        const result = await transitionConversation({
          requestId: next.id,
          conversationId: conversation._id,
          version: next.version,
          operation,
        });
        if (!result.ok) setError(result.error);
        if (result.ok || !["PERSISTENCE_UNAVAILABLE", "INTERNAL"].includes(result.code)) transitionRequest.current = null;
        router.refresh();
      } catch { setError("Não foi possível verificar a alteração. Repita a mesma ação para consultar o resultado."); }
      finally { sending.current = false; }
    });
  }

  function navigate(target: string) {
    const nextId = new URL(target, window.location.href).searchParams.get("conversation");
    if (nextId !== conversation?._id) {
      generation.current++;
      activeRequest.current?.abort();
      activeRequest.current = null;
      sending.current = false;
      request.current = null;
    }
    startTransition(() => router.push(target));
  }

  const canReply = conversation
    ? conversation.status !== "closed" &&
    (user.role === "chat" || conversation.agentId === user.uid)
    : user.role === "chat";

  function requestHuman() {
    if (!conversation || handoffSending.current) return;
    handoffSending.current = true;
    setHumanPending(true);
    generation.current++;
    const attempt = generation.current;
    activeRequest.current?.abort();
    activeRequest.current = null;
    sending.current = false;
    setStreamMessages(messages => messages.filter(message => message.role === "chat"));
    const next = handoffRequest.current?.conversationId === conversation._id ? handoffRequest.current
      : { requestId: crypto.randomUUID(), conversationId: conversation._id };
    handoffRequest.current = next;
    setError("");
    startTransition(async () => {
      try {
        const result = await requestHumanSupport(next);
        if (generation.current !== attempt) return;
        if (!result.ok) { setError(result.error); return; }
        handoffRequest.current = null;
        if (createdConversation) {
          const snapshot = await fetchMessages({ conversationId: next.conversationId });
          if (snapshot.ok) { setCreatedConversation(snapshot.data.conversation); setStreamMessages(snapshot.data.items); }
        } else { setStreamMessages([]); router.refresh(); }
      } catch { setError("Não foi possível verificar a transferência. Tente novamente para consultar o resultado."); }
      finally { if (generation.current === attempt) { handoffSending.current = false; setHumanPending(false); } }
    });
  }

  return {
    conversation,
    pending,
    error: error || connectionError,
    streamMessages,
    text,
    messageForm,
    href,
    send,
    change,
    canReply,
    newConversation,
    requestHuman,
    humanPending,
    navigate,
    reply: (message: string) => {
      if (sending.current || pending) return;
      messageForm.setValue("text", message);
      void messageForm.handleSubmit(submitMessage)();
    },
  };
}
