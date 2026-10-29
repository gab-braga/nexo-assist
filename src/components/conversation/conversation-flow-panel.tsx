"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getConversationInteraction,
  confirmConversationDraft,
  cancelConversationDraft,
} from "@/server/actions/tickets";
import type { ConversationInteraction } from "@/types/tickets";
import {
  operationNames,
  priorityNames,
  prioritySla,
} from "@/lib/ticket-display";
import { TicketCard } from "./ticket-card";

export function ConversationFlowPanel({
  conversationId,
  initial,
  busy,
  reply,
}: {
  conversationId: string;
  initial?: ConversationInteraction | null;
  busy: boolean;
  reply: (message: string) => void;
}) {
  const [state, setState] = useState(initial ?? null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const sending = useRef(false);
  const router = useRouter();
  useEffect(() => {
    let current = true;
    if (!busy)
      void getConversationInteraction(conversationId)
        .then((result) => {
          if (!current) return;
          if (result.ok) setState(result.data);
          else setError(result.error);
        })
        .catch(() => {
          if (current)
            setError(
              "Não foi possível recuperar a operação. Atualize a conversa.",
            );
        });
    return () => {
      current = false;
    };
  }, [conversationId, busy, initial]);

  function act(confirm: boolean) {
    if (!state?.draft || busy || sending.current) return;
    sending.current = true;
    setError("");
    const input = {
      conversationId,
      draftId: state.draft.draftId,
      digest: state.draft.digest,
    };
    startTransition(async () => {
      try {
        const result = await (confirm
          ? confirmConversationDraft(input)
          : cancelConversationDraft(input));
        if (!result.ok) setError(result.error);
        const fresh = await getConversationInteraction(conversationId);
        if (fresh.ok) setState(fresh.data);
        router.refresh();
      } catch {
        setError(
          "Não foi possível verificar o resultado. Repita a mesma confirmação para consultar; não prepare outra abertura.",
        );
      } finally {
        sending.current = false;
      }
    });
  }
  const draft = state?.draft;
  const live =
    draft?.state === "pending" && new Date(draft.expiresAt) > new Date();
  return (
    <div className="max-w-150.25 mb-4" aria-busy={pending}>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!busy && state?.flow?.question && (
        <p className="my-2 text-sm">{state.flow.question}</p>
      )}
      {!busy && state?.flow?.choices?.length ? (
        <div className="my-2 flex flex-wrap gap-2">
          {state.flow.choices.map((choice) => (
            <Button
              key={choice.label}
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => reply(choice.message)}
            >
              {choice.label}
            </Button>
          ))}
        </div>
      ) : null}
      {!busy &&
        state?.flow?.stage === "selecting" &&
        state.tickets.length > 0 && (
          <div
            data-visual="ticket-list"
            className="my-2 overflow-hidden rounded-4.25 border border-border bg-card"
          >
            {state.tickets.map((ticket) => (
              <button
                key={ticket._id}
                type="button"
                disabled={pending}
                className="block w-full border-b border-border p-3 text-left text-sm last:border-0 hover:bg-muted wrap-anywhere"
                onClick={() =>
                  reply(
                    `É este chamado: ${ticket.number}. Identificador: ${ticket._id}`,
                  )
                }
              >
                {ticket.title} · {ticketStatusLabel(ticket.status)}
              </button>
            ))}
          </div>
        )}
      {draft && draft.state !== "applied" && (
        <section
          data-visual="draft-card"
          className="my-2 overflow-hidden rounded-4.25 border border-border bg-card p-4 text-sm shadow-[0_1px_2px_#18233408,0_5px_14px_#18233403]"
        >
          <h3 className="font-semibold">
            Revisar {operationNames[draft.operation].toLocaleLowerCase("pt-BR")}
          </h3>
          <p className="mt-2 font-semibold wrap-break-word">
            {draft.data.title}
          </p>
          <p className="my-2 whitespace-pre-wrap wrap-break-word">
            {draft.data.description}
          </p>
          <p>
            Tipo: {draft.data.type} · Categoria: {draft.data.category}
          </p>
          <p>
            Prioridade: {priorityNames[draft.priority]} · Prazo de resposta:{" "}
            {prioritySla[draft.priority]}
          </p>
          <p>Funcionário afetado: {draft.affectedEmployee}</p>
          {draft.reason && <p>Motivo: {draft.reason}</p>}
          <p className="mt-2 text-muted-foreground">
            {live
              ? "Confira os dados antes de confirmar. Para alterar, envie uma mensagem com a correção."
              : "Rascunho expirado, cancelado ou substituído. Peça ao assistente uma nova proposta para confirmar."}
          </p>
          {live && !busy && !state?.canConfirm && (
            <p className="mt-2 text-muted-foreground">
              A confirmação está indisponível durante o processamento ou
              atendimento humano.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || pending || !live || !state?.canConfirm}
              onClick={() => act(true)}
            >
              <Check size={14} />
              {pending ? "Verificando…" : "Confirmar operação"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || pending || !live || !state?.canConfirm}
              onClick={() => act(false)}
            >
              <X size={14} />
              Cancelar
            </Button>
          </div>
        </section>
      )}
      {state?.selectedTicket && <TicketCard ticket={state.selectedTicket} />}
    </div>
  );
}

function ticketStatusLabel(status: "open" | "waiting_human" | "resolved") {
  return {
    open: "Aberto",
    waiting_human: "Aguardando analista",
    resolved: "Resolvido",
  }[status];
}
