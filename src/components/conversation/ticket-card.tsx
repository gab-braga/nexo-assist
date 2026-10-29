import type { TicketDTO } from "@/types/tickets";
import { priorityNames, ticketStatusNames } from "@/lib/ticket-display";
import { Status } from "@/components/status";

export function TicketCard({ ticket }: { ticket: TicketDTO }) {
  return (
    <section
      data-visual="ticket-card"
      className="my-2 overflow-hidden rounded-4.25 border border-border bg-card p-4 text-sm shadow-[0_1px_2px_#18233408,0_5px_14px_#18233403]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="wrap-anywhere">{ticket.number}</span>
        <Status color={ticket.overdue ? "amber" : "blue"}>
          {ticketStatusNames[ticket.status]}
        </Status>
      </div>
      <h3 className="my-2 font-semibold wrap-break-word">{ticket.title}</h3>
      <p>
        {ticket.type} · {ticket.category} · Prioridade{" "}
        {priorityNames[ticket.priority]}
      </p>
      <p>Funcionário afetado: {ticket.customerName}</p>
      <p>
        Prazo de resposta:{" "}
        {new Date(ticket.nextResponseDueAt).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        })}
      </p>
      {ticket.overdue && (
        <p className="mt-1 text-amber-700">
          Prazo de resposta vencido. Solicite atendimento humano.
        </p>
      )}
    </section>
  );
}
