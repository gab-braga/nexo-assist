"use client";

import { useState, useTransition } from "react";
import type { ConversationDTO } from "@/types/domain";
import type { WorkspaceProps } from "./use-conversation-workspace";
import { getAnalystContext } from "@/server/actions/conversations";
import { Button } from "@/components/ui/button";
import { TicketCard } from "./ticket-card";

const reasons = {
  requested: "Solicitação do funcionário",
  critical: "Incidente crítico",
  overdue: "Prazo de resposta vencido",
  uncertain: "Necessidade de análise humana",
};
export function AnalystContext({
  conversation,
  initial,
}: {
  conversation: ConversationDTO;
  initial: WorkspaceProps["analystContext"];
}) {
  const [tickets, setTickets] = useState(initial?.tickets ?? []);
  const [cursor, setCursor] = useState(initial?.nextCursor ?? null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const handoff = conversation.handoff;
  const summary = handoff?.summary;
  return (
    <section className="mb-6 text-sm" data-visual="handoff-context">
      {summary && (
        <>
          <h3>Resumo da transferência</h3>
          <div className="mb-4 rounded-[14px] bg-muted p-4 text-[13px] whitespace-pre-wrap wrap-break-word">
            <p className="mb-2 font-medium">{reasons[handoff!.reason]}</p>
            <p>{summary.problem}</p>
            {summary.relatedTickets.length > 0 && (
              <>
                <strong className="mt-3 block">Chamados relacionados</strong>
                {summary.relatedTickets.map((ticket) => (
                  <p key={ticket.id} className="wrap-anywhere">
                    {ticket.number}: {ticket.title}
                  </p>
                ))}
              </>
            )}
            {summary.information.length > 0 && (
              <>
                <strong className="mt-3 block">
                  Informações do funcionário
                </strong>
                {summary.information.map((text, index) => (
                  <p key={index}>{text}</p>
                ))}
              </>
            )}
            {summary.guidance.length > 0 && (
              <>
                <strong className="mt-3 block">Orientações apresentadas</strong>
                {summary.guidance.map((text, index) => (
                  <p key={index}>{text}</p>
                ))}
              </>
            )}
            {summary.operations.length > 0 && (
              <>
                <strong className="mt-3 block">Operações registradas</strong>
                {summary.operations.map((text, index) => (
                  <p key={index}>{text}</p>
                ))}
              </>
            )}
            {summary.pending.length > 0 && (
              <>
                <strong className="mt-3 block">Pendências</strong>
                {summary.pending.map((text, index) => (
                  <p key={index}>{text}</p>
                ))}
              </>
            )}
            {summary.agentNote && (
              <>
                <strong className="mt-3 block">
                  Observação da transferência
                </strong>
                <p>{summary.agentNote}</p>
              </>
            )}
          </div>
        </>
      )}
      <h3>Chamados do funcionário</h3>
      {!initial && (
        <p className="text-muted-foreground">
          Não foi possível carregar os chamados. Atualize para tentar novamente.
        </p>
      )}
      {initial && !tickets.length && (
        <p className="text-muted-foreground">Nenhum chamado encontrado.</p>
      )}
      {tickets.map((ticket) => (
        <TicketCard key={ticket._id} ticket={ticket} />
      ))}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {cursor && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                const result = await getAnalystContext({
                  conversationId: conversation._id,
                  cursor,
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setTickets((items) => [
                  ...items,
                  ...result.data.tickets.filter(
                    (ticket) => !items.some((item) => item._id === ticket._id),
                  ),
                ]);
                setCursor(result.data.nextCursor);
              } catch {
                setError("Não foi possível carregar mais chamados.");
              }
            })
          }
        >
          {pending ? "Carregando…" : "Mais chamados"}
        </Button>
      )}
    </section>
  );
}
