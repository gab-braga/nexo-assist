"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";
import { ArrowUp, ArrowRightLeft, Check, Plus } from "lucide-react";
import { tickets, draft, impactOptions, chatCopy } from "@/data/data";
import { AssistantLabel } from "./components/assistant-label";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Status } from "@/components/status";
import { Ticket } from "@/interfaces/ticket";

export default function ChatPage() {
  const [mode, setMode] = useState<"new" | "consult">("new");
  const [selected, setSelected] = useState(tickets[0]);
  const [impact, setImpact] = useState(impactOptions[0]);
  const [confirmed, setConfirmed] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [transferred, setTransferred] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(draft.title);
  const [description, setDescription] = useState(draft.description);

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    if (/status|consulta|chamados/i.test(input)) {
      setMode("consult");
      setMessages([]);
    } else {
      setMessages([...messages, input]);
    }
    setInput("");
  }

  return (
    <main
      data-visual="customer-chat menu-anchor"
      data-mode={mode}
      className={cn(
        "group/chat max-w-202 mx-auto relative h-[calc(100dvh-64px)] flex flex-col pt-18.25 max-[1250.001px]:mx-8 max-[1250.001px]:max-w-none max-[800.001px]:mx-5 max-[800.001px]:pt-11.25 max-[540.001px]:h-[calc(100dvh-58px)] max-[540.001px]:mx-3 max-[540.001px]:pt-10.5",
        mode === "consult" && "pt-13.5",
      )}
    >
      <div
        data-visual="chat-tools"
        className="absolute top-4 right-0 flex gap-3 text-muted-foreground text-2.75 opacity-0 transition-opacity duration-200 group-hover/chat:opacity-100 focus-within:opacity-100 [&>button]:flex [&>button]:items-center [&>button]:gap-0.75 max-[800.001px]:opacity-100 max-[800.001px]:top-3"
      >
        <button
          className="cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 disabled:cursor-default"
          onClick={() => {
            setMode("new");
            setMessages([]);
            setCancelled(false);
            setConfirmed(false);
          }}
        >
          <Plus size={13} />
          Novo chamado
        </button>
        <button
          className="cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 disabled:cursor-default"
          onClick={() => {
            setMode("consult");
            setMessages([]);
          }}
        >
          Consultar chamados
        </button>
      </div>
      <div
        data-visual="customer-transcript"
        className="flex-1 min-h-0 overflow-auto scrollbar-thin pt-4.75 max-[540.001px]:pt-2"
      >
        {mode === "new" ? (
          <>
            <div
              data-visual="customer-bubble"
              className="ml-auto mb-4.75 w-fit max-w-130 bg-[#1c2633] text-white py-3 px-4 rounded-[12px_12px_3px_12px] leading-5.25 min-h-10.75 group-data-[mode=new]/chat:w-130 max-[800.001px]:max-w-[90%] max-[800.001px]:group-data-[mode=new]/chat:w-fit max-[540.001px]:text-[12px] max-[540.001px]:leading-4.75 max-[540.001px]:mb-3.75 min-[801px]:group-data-[mode=new]/chat:nth-3:pr-15"
            >
              {chatCopy.vpnQuestion}
            </div>
            <div
              data-visual="assistant-group"
              className="mb-4.75 max-[540.001px]:mb-3.75"
            >
              <AssistantLabel
                actions={[
                  "consultou seus chamados",
                  "buscou na central de ajuda",
                ]}
              />
              <div
                data-visual="assistant-bubble"
                className="max-w-150.25 border border-border rounded-[4px_13px_13px_13px] py-3 px-3.75 leading-5.5 [&>strong]:block [&>strong]:mt-2.5 [&>strong]:mb-2 [&>strong]:font-semibold group-data-[mode=new]/chat:py-2.5 max-[800.001px]:text-[13px] max-[540.001px]:p-2.5 max-[540.001px]:text-[12px] max-[540.001px]:leading-5"
              >
                <p>{chatCopy.vpnAnswer}</p>
                <strong>Quem está sendo afetado?</strong>
                <div
                  data-visual="choice-row"
                  className="flex flex-wrap gap-1.25 mt-2.5 [&>button]:h-8.25 [&>button]:font-normal [&>button]:px-2.75 [&>button]:text-[13px] [&>button]:shadow-none max-[800.001px]:[&>button]:text-2.75 max-[800.001px]:[&>button]:px-2"
                >
                  {impactOptions.map((option) => (
                    <Button
                      key={option}
                      variant="outline"
                      className={cn(
                        impact === option &&
                          "[&&]:text-primary [&&]:border-ring [&&]:bg-secondary",
                      )}
                      onClick={() => setImpact(option)}
                    >
                      {option}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <div
              data-visual="customer-bubble"
              className="ml-auto mb-4.75 w-fit max-w-130 bg-[#1c2633] text-white py-3 px-4 rounded-[12px_12px_3px_12px] leading-5.25 min-h-10.75 group-data-[mode=new]/chat:w-130 max-[800.001px]:max-w-[90%] max-[800.001px]:group-data-[mode=new]/chat:w-fit max-[540.001px]:text-[12px] max-[540.001px]:leading-4.75 max-[540.001px]:mb-3.75 min-[801px]:group-data-[mode=new]/chat:nth-3:pr-15"
            >
              {chatCopy.impactReply}
            </div>
            <div
              data-visual="assistant-group"
              className="mb-4.75 max-[540.001px]:mb-3.75"
            >
              <AssistantLabel
                actions={[
                  "classificou a prioridade",
                  "consultou o SLA",
                  "montou o rascunho",
                ]}
              />
              <div
                data-visual="assistant-bubble"
                className="max-w-150.25 border border-border rounded-[4px_13px_13px_13px] py-3 px-3.75 leading-5.5 [&>strong]:block [&>strong]:mt-2.5 [&>strong]:mb-2 [&>strong]:font-semibold group-data-[mode=new]/chat:py-2.5 max-[800.001px]:text-[13px] max-[540.001px]:p-2.5 max-[540.001px]:text-[12px] max-[540.001px]:leading-5"
              >
                {chatCopy.draftAnswer}
              </div>
              {!cancelled ? (
                <section
                  data-visual="card ticket-card transfer-bubble"
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
                      <span>
                        {confirmed
                          ? "Chamado · INC-20517"
                          : `Novo chamado · Rascunho ${draft.id}`}
                      </span>
                      <Status color={confirmed ? "green" : "amber"}>
                        {confirmed
                          ? "Chamado criado"
                          : "Aguardando confirmação"}
                      </Status>
                    </div>
                    <h2>{title}</h2>
                    <p>{description}</p>
                    <div
                      data-visual="ticket-fields"
                      className="grid grid-cols-3 border-t border-border mt-3 pt-2.5 gap-3 [&>div]:flex [&>div]:flex-col [&>div]:gap-0.5 [&_small]:text-[12px] **:data-[slot=status]:text-[14px] **:data-[slot=status]:text-foreground max-[800.001px]:grid-cols-2 max-[800.001px]:gap-2.5 max-[800.001px]:text-[12px] max-[540.001px]:**:data-[slot=status]:text-[12px]"
                    >
                      <div>
                        <small className="text-[12px] text-muted-foreground">
                          Categoria
                        </small>
                        {draft.category}
                      </div>
                      <div>
                        <small className="text-[12px] text-muted-foreground">
                          Prioridade
                        </small>
                        <span>
                          <Status color="amber">Alta</Status>{" "}
                          <span
                            data-visual="muted"
                            className="text-muted-foreground text-[13px]"
                          >
                            · resposta até 13:43
                          </span>
                        </span>
                      </div>
                      <div>
                        <small className="text-[12px] text-muted-foreground">
                          Afetados
                        </small>
                        {impact === "Só eu" ? "Somente você" : impact}
                      </div>
                    </div>
                  </div>
                  {!confirmed && (
                    <div
                      data-visual="ticket-actions"
                      className="flex gap-1.5 py-1.75 px-2 bg-muted border-t border-border"
                    >
                      <Button onClick={() => setConfirmed(true)}>
                        Confirmar{" "}
                        <kbd className="text-[10px] bg-[#ffffff25] rounded py-px px-1.25">
                          ⌘↵
                        </kbd>
                      </Button>
                      <Button variant="outline" onClick={() => setEdit(true)}>
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setCancelled(true)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </section>
              ) : (
                <div
                  data-visual="assistant-bubble"
                  className="max-w-150.25 border border-border rounded-[4px_13px_13px_13px] py-3 px-3.75 leading-5.5 [&>strong]:block [&>strong]:mt-2.5 [&>strong]:mb-2 [&>strong]:font-semibold group-data-[mode=new]/chat:py-2.5 max-[800.001px]:text-[13px] max-[540.001px]:p-2.5 max-[540.001px]:text-[12px] max-[540.001px]:leading-5"
                >
                  Rascunho cancelado. Posso ajudar com outra coisa?
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div
              data-visual="customer-bubble"
              className="ml-auto mb-4.75 w-fit max-w-130 bg-[#1c2633] text-white py-3 px-4 rounded-[12px_12px_3px_12px] leading-5.25 min-h-10.75 group-data-[mode=new]/chat:w-130 max-[800.001px]:max-w-[90%] max-[800.001px]:group-data-[mode=new]/chat:w-fit max-[540.001px]:text-[12px] max-[540.001px]:leading-4.75 max-[540.001px]:mb-3.75 min-[801px]:group-data-[mode=new]/chat:nth-3:pr-15"
            >
              {chatCopy.statusQuestion}
            </div>
            <div
              data-visual="assistant-group"
              className="mb-4.75 max-[540.001px]:mb-3.75"
            >
              <AssistantLabel actions={["consultou seus chamados"]} />
              <div
                data-visual="assistant-bubble"
                className="max-w-150.25 border border-border rounded-[4px_13px_13px_13px] py-3 px-3.75 leading-5.5 [&>strong]:block [&>strong]:mt-2.5 [&>strong]:mb-2 [&>strong]:font-semibold group-data-[mode=new]/chat:py-2.5 max-[800.001px]:text-[13px] max-[540.001px]:p-2.5 max-[540.001px]:text-[12px] max-[540.001px]:leading-5"
              >
                Você tem 3 chamados abertos. Sobre qual deles quer saber?
              </div>
              <div
                data-visual="card ticket-list transfer-bubble"
                className="mt-1.25 [&>button]:w-full [&>button]:flex [&>button]:items-center [&>button]:text-left [&>button]:gap-3.5 [&>button]:py-3 [&>button]:px-4 [&>button]:min-h-11.25 [&>button+button]:border-t **:data-[slot=status]:text-[12px] **:data-[slot=status]:text-muted-foreground [&_small:last-child]:ml-2 max-[800.001px]:[&>button]:flex-wrap max-[800.001px]:[&>button]:gap-1.75 max-[800.001px]:**:data-[slot=status]:ml-5.75 max-[800.001px]:[&_small:last-child]:ml-auto max-[540.001px]:[&>button]:p-2.5 max-[540.001px]:[&_small]:text-[10px] overflow-hidden rounded-4.25 border border-border bg-card shadow-[0_1px_2px_#18233408,0_5px_14px_#18233403]"
              >
                {tickets.slice(0, 3).map((ticket) => (
                  <button
                    key={ticket.id}
                    className={cn(
                      "cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 disabled:cursor-default",
                      selected.id === ticket.id && "bg-[#f4f9ff]",
                    )}
                    onClick={() => setSelected(ticket)}
                  >
                    <span
                      data-visual="radio"
                      className={cn(
                        "border-[1.5px] border-[#cdd2d8] size-4 rounded-full shrink-0",
                        selected.id === ticket.id &&
                          "border-1.25 border-primary",
                      )}
                    />
                    <small className="text-[12px] text-muted-foreground">
                      {ticket.id}
                    </small>
                    <span
                      data-visual="ticket-list-title"
                      className="flex-1 max-[800.001px]:basis-[65%] max-[800.001px]:text-[13px] max-[540.001px]:basis-[55%] max-[540.001px]:text-[12px]"
                    >
                      {ticket.title}
                    </span>
                    <Status color={ticket.color}>{ticket.status}</Status>
                    <small className="text-[12px] text-muted-foreground">
                      {ticket.date}
                    </small>
                  </button>
                ))}
              </div>
            </div>
            <div
              data-visual="customer-bubble"
              className="ml-auto mb-4.75 w-fit max-w-130 bg-[#1c2633] text-white py-3 px-4 rounded-[12px_12px_3px_12px] leading-5.25 min-h-10.75 group-data-[mode=new]/chat:w-130 max-[800.001px]:max-w-[90%] max-[800.001px]:group-data-[mode=new]/chat:w-fit max-[540.001px]:text-[12px] max-[540.001px]:leading-4.75 max-[540.001px]:mb-3.75 min-[801px]:group-data-[mode=new]/chat:nth-3:pr-15"
            >
              {selected.id} · {selected.title}
            </div>
            <div
              data-visual="assistant-group"
              className="mb-4.75 max-[540.001px]:mb-3.75"
            >
              <AssistantLabel
                actions={[`consultou o ${selected.id}`, "calculou o prazo"]}
              />
              <TicketDetail ticket={selected} />
              <div
                data-visual="assistant-bubble transfer-bubble"
                className="max-w-150.25 border border-border rounded-[4px_13px_13px_13px] py-3 px-3.75 leading-5.5 [&>strong]:block [&>strong]:mt-2.5 [&>strong]:mb-2 [&>strong]:font-semibold group-data-[mode=new]/chat:py-2.5 max-[800.001px]:text-[13px] max-[540.001px]:p-2.5 max-[540.001px]:text-[12px] max-[540.001px]:leading-5 mt-1.25"
              >
                {transferred ? (
                  <>
                    <ArrowRightLeft size={15} />
                    {chatCopy.transfer}
                  </>
                ) : (
                  <>
                    <p>
                      Está sem atualização há 5 dias, acima do prazo de 3 dias
                      úteis para prioridade média. Quer que eu chame um
                      analista?
                    </p>
                    <div
                      data-visual="choice-row"
                      className="flex flex-wrap gap-1.25 mt-2.5 [&>button]:h-8.25 [&>button]:font-normal [&>button]:px-2.75 [&>button]:text-[13px] [&>button]:shadow-none max-[800.001px]:[&>button]:text-2.75 max-[800.001px]:[&>button]:px-2"
                    >
                      <Button
                        variant="outline"
                        onClick={() => setTransferred(true)}
                      >
                        Falar com um analista
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          document.getElementById("chat-input")?.focus()
                        }
                      >
                        Adicionar informação
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          setMessages([...messages, "Não, obrigado"])
                        }
                      >
                        Não, obrigado
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
        {messages.map((message, i) => (
          <div
            data-visual="customer-bubble"
            className="ml-auto mb-4.75 w-fit max-w-130 bg-[#1c2633] text-white py-3 px-4 rounded-[12px_12px_3px_12px] leading-5.25 min-h-10.75 group-data-[mode=new]/chat:w-130 max-[800.001px]:max-w-[90%] max-[800.001px]:group-data-[mode=new]/chat:w-fit max-[540.001px]:text-[12px] max-[540.001px]:leading-4.75 max-[540.001px]:mb-3.75 min-[801px]:group-data-[mode=new]/chat:nth-3:pr-15"
            key={i}
          >
            {message}
          </div>
        ))}
      </div>
      <form
        data-visual="customer-composer"
        className="pb-4 bg-card [&>div]:flex [&>div]:items-center [&>div]:p-1.25 [&>div]:border [&>div]:border-[#dfe2e7] [&>div]:rounded-[13px] [&>div]:min-h-12.25 [&_input]:flex-1 [&_input]:min-w-0 [&_input]:py-1.75 [&_input]:px-2.5 [&_input]:text-[14px] [&_input]:placeholder:text-muted-foreground [&>small]:block [&>small]:text-right [&>small]:mt-1 max-[540.001px]:[&_input]:text-[12px] max-[540.001px]:[&_input]:pl-1.5 max-[540.001px]:[&_button]:text-[12px] max-[540.001px]:[&_button]:px-2.25 max-[540.001px]:[&>small]:text-[10px]"
        onSubmit={send}
      >
        <div>
          <input
            className="[-webkit-tap-highlight-color:transparent] outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            id="chat-input"
            aria-label="Mensagem"
            placeholder="Escreva para o Nexo..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <Button type="submit">
            <ArrowUp />
            Enviar
          </Button>
        </div>
        <small className="text-[12px] text-muted-foreground">
          {(mode === "new" ? 18 : 16) + messages.length}/30 mensagens nesta
          sessão
        </small>
      </form>
      <Dialog open={edit} onOpenChange={setEdit} title="Editar chamado">
        <label
          data-visual="field-label"
          className="block text-[13px] mt-3 mb-1.5"
          htmlFor="ticket-title"
        >
          Título
        </label>
        <input
          data-visual="form-input"
          id="ticket-title"
          className="[-webkit-tap-highlight-color:transparent] outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 w-full border border-border rounded-lg p-2.5 text-[14px]"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label
          data-visual="field-label"
          className="block text-[13px] mt-3 mb-1.5"
          htmlFor="ticket-description"
        >
          Descrição
        </label>
        <textarea
          data-visual="form-input"
          id="ticket-description"
          className="[-webkit-tap-highlight-color:transparent] outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 w-full border border-border rounded-lg p-2.5 text-[14px] min-h-28"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Button className="mt-4" onClick={() => setEdit(false)}>
          <Check />
          Salvar alterações
        </Button>
      </Dialog>
    </main>
  );
}
export function TicketDetail({ ticket }: { ticket: Ticket }) {
  return (
    <section
      data-visual="card ticket-card transfer-bubble"
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
          <span>Chamado · {ticket.id}</span>
          <Status color={ticket.color}>{ticket.status}</Status>
        </div>
        <h2>
          {ticket.title}
          {ticket.id === "INC-20311" ? " do Windows" : ""}
        </h2>
        <p>{ticket.description}</p>
        <div
          data-visual="ticket-fields"
          className="grid border-t border-border mt-3 pt-2.5 gap-3 [&>div]:flex [&>div]:flex-col [&>div]:gap-0.5 [&_small]:text-[12px] **:data-[slot=status]:text-[14px] **:data-[slot=status]:text-foreground max-[800.001px]:gap-2.5 max-[800.001px]:text-[12px] max-[540.001px]:**:data-[slot=status]:text-[12px] grid-cols-4 max-[800.001px]:grid-cols-2"
        >
          <div>
            <small className="text-[12px] text-muted-foreground">
              Categoria
            </small>
            {ticket.category}
          </div>
          <div>
            <small className="text-[12px] text-muted-foreground">
              Prioridade
            </small>
            <Status color="gray">{ticket.priority}</Status>
          </div>
          <div>
            <small className="text-[12px] text-muted-foreground">
              Aberto em
            </small>
            {ticket.date}, 14:20
          </div>
          <div>
            <small className="text-[12px] text-muted-foreground">
              Última atualização
            </small>
            <span>
              <span data-visual="overdue" className="text-[#946000]">
                há 5 dias
              </span>
              <span
                data-visual="muted"
                className="text-muted-foreground text-[13px]"
              >
                {" "}
                · prazo vencido
              </span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
