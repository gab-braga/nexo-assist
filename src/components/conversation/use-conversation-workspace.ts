"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createConversation,
  sendMessage,
  transitionConversation,
} from "@/server/actions/conversations";
import type { ConversationDTO, SessionUser } from "@/types/domain";
import type {
  listConversations,
  getMessages,
} from "@/server/services/conversations";

export type WorkspaceProps = {
  user: SessionUser;
  list: Awaited<ReturnType<typeof listConversations>>;
  conversation: ConversationDTO | null;
  history: Awaited<ReturnType<typeof getMessages>> | null;
  search: string;
  status: string;
  older: boolean;
};

export function useConversationWorkspace({
  user,
  conversation,
  search,
  status,
  older,
}: WorkspaceProps) {
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

  return {
    pending,
    error,
    text,
    setText,
    subject,
    setSubject,
    setCreationId,
    href,
    create,
    send,
    change,
    canReply,
    navigate: router.push,
  };
}
