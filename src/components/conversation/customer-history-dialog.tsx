"use client";

import { useRef, useState } from "react";
import { History, MessageCircle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Status } from "@/components/status";
import { listCustomerHistory } from "@/server/actions/conversations";
import type { ConversationOperationalState } from "@/types/domain";

type HistoryPage = Awaited<
  ReturnType<
    typeof import("@/server/services/conversations").listCustomerHistory
  >
>;
const states: Record<
  ConversationOperationalState,
  { label: string; color: string }
> = {
  AGENT_ACTIVE: { label: "Atendimento com IA", color: "blue" },
  WAITING_FOR_ANALYST: { label: "Aguardando analista", color: "amber" },
  ANALYST_ACTIVE: { label: "Em atendimento humano", color: "green" },
  CLOSED: { label: "Encerrado", color: "gray" },
};
const date = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });

export function CustomerHistoryDialog({
  select,
}: {
  select: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HistoryPage["items"]>([]);
  const [cursor, setCursor] = useState<HistoryPage["nextCursor"]>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const fetching = useRef(false);

  async function load(
    next: HistoryPage["nextCursor"],
    attempt = generation.current,
  ) {
    if (fetching.current) return;
    fetching.current = true;
    setLoading(true);
    setError("");
    try {
      const result = await listCustomerHistory(next ? { cursor: next } : {});
      if (attempt !== generation.current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems((previous) =>
        next
          ? [
              ...previous,
              ...result.data.items.filter(
                (item) => !previous.some((saved) => saved._id === item._id),
              ),
            ]
          : result.data.items,
      );
      setCursor(result.data.nextCursor);
    } catch {
      if (attempt === generation.current)
        setError(
          "Não foi possível carregar seus atendimentos. Tente novamente.",
        );
    } finally {
      if (attempt === generation.current) {
        fetching.current = false;
        setLoading(false);
      }
    }
  }
  function changeOpen(next: boolean) {
    generation.current++;
    fetching.current = false;
    setOpen(next);
    if (next) {
      setItems([]);
      setCursor(null);
      void load(null);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={changeOpen}
      title="Meus atendimentos"
      trigger={
        <button type="button">
          <History size={13} />
          Meus atendimentos
        </button>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Consulte seu histórico ou continue um atendimento aberto.
      </p>
      <div
        className="max-h-[65dvh] overflow-y-auto scrollbar-thin"
        aria-busy={loading}
        aria-label="Lista de atendimentos"
      >
        {items.map((item) => (
          <button
            key={item._id}
            type="button"
            aria-label={`${item.operationalState === "CLOSED" ? "Consultar" : "Continuar"} atendimento: ${item.subject}`}
            className="mb-3 block w-full rounded-xl border border-border bg-card p-3 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => {
              changeOpen(false);
              select(item._id);
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="min-w-0 flex-1 font-medium text-sm wrap-break-word">
                {item.subject}
              </span>
              <span className="rounded-full bg-muted px-2 py-1">
                <Status color={states[item.operationalState].color}>
                  {states[item.operationalState].label}
                </Status>
              </span>
            </div>
            <p className="my-2 text-sm text-muted-foreground line-clamp-2 wrap-anywhere">
              {item.lastMessagePreview || "Nenhuma mensagem registrada."}
            </p>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <time dateTime={item.updatedAt}>{date(item.updatedAt)}</time>
              <span>
                {item.operationalState === "CLOSED"
                  ? "Somente consulta"
                  : "Continuar conversa"}
              </span>
            </div>
          </button>
        ))}
        {loading && (
          <div
            role="status"
            aria-label="Carregando atendimentos"
            className="space-y-3"
          >
            {Array.from({ length: items.length ? 1 : 3 }, (_, index) => (
              <div
                key={index}
                className="space-y-3 rounded-xl border border-border p-3"
              >
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        )}
        {!loading && error && (
          <div role="alert" className="space-y-3 text-sm">
            <p className="text-red-700">{error}</p>
            <Button variant="outline" onClick={() => void load(cursor)}>
              Tentar novamente
            </Button>
          </div>
        )}
        {!loading && !error && !items.length && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <MessageCircle className="mx-auto mb-3" size={24} />
            <p>Você ainda não tem atendimentos.</p>
          </div>
        )}
        {!loading && !error && cursor && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => void load(cursor)}
          >
            Carregar mais atendimentos
          </Button>
        )}
      </div>
    </Dialog>
  );
}
