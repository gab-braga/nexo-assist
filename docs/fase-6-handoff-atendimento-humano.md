# Fase 6 — Transferência e atendimento humano

## Arquitetura preservada

O projeto já tinha fila, mensagens humanas, atribuição por versão, devolução à fila, encerramento, memória e uma ferramenta de handoff. As lacunas eram a devolução efetiva à IA, o resumo estruturado no console, a reconciliação de transições repetidas e a pausa estrita de uma execução já iniciada. Antes, a execução que solicitava handoff ainda podia concluir uma resposta depois de mudar o estado.

Foram reutilizados Firebase Authentication, Firestore Enterprise/MongoDB, os serviços/repositories, o agente Mastra único, Server Actions, histórico e componentes existentes. A documentação local do Next.js sobre Server Actions foi consultada. Não há novo banco, dependência, WebSocket ou console paralelo.

## Estados e transições

Os quatro estados continuam derivados dos campos persistidos, sem criar uma segunda máquina de estados:

| Estado lógico | Campos |
| --- | --- |
| `AGENT_ACTIVE` | `waiting`, IA habilitada, sem handoff e sem responsável |
| `WAITING_FOR_ANALYST` | `waiting`, handoff ativo ou conversa humana legada |
| `ANALYST_ACTIVE` | `active`, analista responsável |
| `CLOSED` | `closed` |

| Operação | Origem | Destino | Autorização |
| --- | --- | --- | --- |
| Transferir | IA ativa | Fila humana | Funcionário proprietário ou ferramenta autenticada dessa execução |
| Assumir | Fila humana | Analista ativo | Papel `agent`, conversa disponível e versão atual |
| Devolver à IA | Analista ativo | IA ativa | Analista responsável |
| Devolver à fila | Analista ativo | Fila humana | Analista responsável; comportamento anterior preservado |
| Encerrar | Analista ativo | Encerrada | Analista responsável |

A tomada direta pelo analista de uma conversa ainda em IA, já permitida pelo projeto, continua disponível como intervenção explícita. Também cancela a execução e invalida propostas. A fila “Aguardando” exclui conversas em IA; o filtro “Com Nexo Assist” permite observá-las. “Todos”, “Em atendimento”, “Meus atendimentos” e histórico encerrado continuam disponíveis. A política existente permite a analistas autenticados acompanhar todas as conversas; somente o responsável responde/devolve/encerra.

`assignedAt`, `returnedAt` e `closedAt` persistem datas ISO. Encerrar a conversa não resolve chamados. Devolver à IA não reinicia a conversa, não zera o limite de 30 mensagens e não executa mensagens antigas automaticamente: o funcionário envia uma nova mensagem para continuar.

## Serviço compartilhado de transferência

`src/server/repositories/handoff.ts` centraliza `transferToHuman()`. Tanto a ferramenta Mastra quanto a solicitação direta autenticada do chat usam a mesma transação.

O modelo reconhece pedidos e incerteza em contexto pela ferramenta existente; não foi criado um classificador baseado somente em palavras-chave. Condições verificáveis têm controles determinísticos: consulta de chamado crítico/vencido, avaliação de prioridade crítica e preparação de proposta crítica encaminham a conversa imediatamente. Não é necessário criar um chamado antes de transferir. O fluxo de confirmação da Fase 5 também continua encaminhando operações críticas/vencidas, com o mesmo contrato de resumo persistido.

A opção “Atendimento humano” no chat atende ao pedido explícito sem depender do provedor ou de mais um turno da IA. Permanece utilizável no limite de mensagens e pode interromper uma resposta em andamento. O cliente cancela a leitura do streaming; o servidor valida propriedade e estado, independentemente da interface.

Na mesma transação, o serviço:

1. Verifica proprietário, estado e, quando aplicável, execução, lease e versão de controle.
2. Recupera mensagens da própria conversa, a mensagem inicial e o chamado selecionado do mesmo proprietário.
3. Prepara um resumo estruturado e invalida propostas pendentes.
4. Interrompe a execução ativa e incrementa `aiControlVersion`.
5. Atualiza a conversa para a fila, liberando `aiActiveRunId`.
6. Persiste a notificação determinística e o evento da transferência.

Quando a própria ferramenta solicita a transferência, o recibo dessa execução registra a notificação já persistida como resultado concluído. Esse texto vem do servidor; não é uma resposta nova do LLM após a mudança de estado. Quando o funcionário solicita externamente durante outra execução, essa execução fica interrompida e não publica sua resposta.

O identificador do pedido vincula um recibo persistente à notificação. Repetir um pedido recupera o recibo, inclusive depois de devolução à IA ou encerramento. Pedidos adicionais enquanto a conversa já está na fila recuperam o resultado existente; não criam outra transferência. Reutilizar um identificador para outro recurso é rejeitado.

## Resumo e privacidade

`Conversation.handoff` contém identificador, motivo, instante, referência à notificação e resumo:

- Problema e informações recentes fornecidas pelo funcionário.
- Referências a chamados autorizados.
- Orientações apresentadas e operações registradas.
- Pendências, incluindo a necessidade de nova confirmação de propostas invalidadas.
- Observação da transferência, fornecida pela ferramenta ou pela solicitação explícita do funcionário, separada dos dados recuperados pelo servidor.

O resumo usa projeções limitadas e mensagens da própria conversa; não inclui tokens de confirmação, credenciais do servidor ou raciocínio privado. Campos comuns de senha/token são mascarados no texto do resumo. Esse mascaramento não é uma classificação completa de qualquer dado sensível possível: a aplicação conserva o histórico autorizado original conforme as regras existentes.

O console apresenta o resumo e os chamados do funcionário no painel lateral existente. A consulta é paginada, limitada ao proprietário da conversa autorizado pelo servidor; o cliente não escolhe um `customerId` para obter acesso. A seleção/consulta do histórico completo continua paginada pelos contratos anteriores.

## Pausa e concorrência

`assertAgentConversation()` não permite exceção para uma execução que já estava ativa antes do handoff. Nova execução, ferramentas, deltas publicados e persistência final verificam estado/versão. A transferência e as transições humanas removem o identificador ativo e incrementam a versão de controle, impedindo que uma execução antiga volte a ser válida após o analista devolver a conversa.

O streaming usa `AbortController` e o sinal existente do Mastra. Ao transferir, o servidor aborta o processamento e entrega a notificação persistida. Fechar o leitor ou detectar controle humano também encerra o processamento. Uma prévia gerada antes da intervenção não é gravada como resposta concluída depois dela. Escritas de chamados continuam exigindo estado, versão e confirmação válidos no servidor.

`applyConversationTransition()` verifica papel, responsável, versão e estado na transação. `assume`, `release`, `return_to_ai` e `close` usam identificador de pedido e hash dos argumentos. O recibo é consultado antes de repetir uma transição, permitindo reconciliar perda de conexão após commit. Chamadas antigas sem `requestId` mantêm compatibilidade por um identificador derivado de usuário/conversa/versão/operação.

Dois analistas disputam o mesmo documento/versionamento: somente um assume. Mensagem, notificação de transição e evento são gravados atomicamente com sequência monotônica. Propostas anteriores são canceladas, e a versão de controle impede confirmação antiga depois de assumir/devolver. O contador da sessão é preservado.

## Mensagens humanas e retorno

As mensagens do funcionário durante a fila/atendimento usam o serviço de mensagens existente, sem passar pelo Mastra. A mensagem do analista exige responsabilidade ativa. Os autores vêm da sessão autenticada. Reenvios conservam UUIDs e não duplicam mensagens ou eventos.

Ao devolver à IA, o histórico permanece intacto. Um resumo limitado das últimas mensagens de analistas entra na memória, além da janela recente e do chamado selecionado. As propostas permanecem invalidadas e devem ser revistas/confirmadas novamente. O retorno não dispara uma operação pendente.

Foi mantida a atualização periódica: aproximadamente cinco segundos no atendimento humano e dez segundos com IA. Abas ocultas e páginas de histórico antigo não disparam essa atualização. Foco e reconexão antecipam a recuperação. Não há infraestrutura de listeners MongoDB/WebSocket adicionada. O intervalo pode sofrer atraso de rede ou do navegador.

No primeiro envio, uma falha ainda preserva o texto digitado. Enquanto a rota criada mantém estado local, a atualização recupera o snapshot autorizado por Server Action para acompanhar analistas sem remontar o formulário. As transições e o pedido direto mantêm seus identificadores em resultados incertos.

## Eventos e erros

Os registros incluem conversa, responsável autenticado, operação, data, estados anterior/novo e resultado:

- `request_human` e recibos de pedidos repetidos.
- `assume`, `release`, `return_to_ai`, `close`.
- `human_message`, vinculado ao identificador da mensagem.
- Falhas/conflitos de transição, sem repetir o mesmo evento a cada retry; resultado de persistência incerto registra `unknown`, e o recibo persistido é a referência para reconciliação.

Mudanças de estado e mensagens de sistema ficam no histórico compartilhado. As mensagens de sistema são identificadas como “Atendimento” no console. O evento de encerramento é independente dos eventos dos chamados.

Conversa inexistente, papel incorreto, responsável diferente, versão obsoleta, estado incompatível, proposta inválida e indisponibilidade mantêm os erros tipados e mensagens seguras. Falhar ao gravar eventos críticos aborta a transação. Uma falha secundária ao registrar um conflito não revela detalhes internos nem transforma a operação em sucesso.

## Arquivos principais

| Área | Arquivos |
| --- | --- |
| Estado e contratos | `src/types/domain.ts`, `ai.ts`; `src/auth/conversation-state.ts`; `src/server/schemas/conversations.ts` |
| Políticas e transações | `src/server/policies/handoff.ts`; `src/server/repositories/handoff.ts`, `conversations.ts`, `agent-runs.ts` |
| Aplicação | `src/server/services/conversations.ts`, `tickets.ts`; `src/server/repositories/tickets.ts`; `src/server/actions/conversations.ts` |
| Agente e memória | `src/server/ai/context.ts`, `tools/index.ts`, `prompts/nexo.ts`, `memory.ts`; `src/lib/schemas/conversation-forms.ts` |
| Interface existente | `agent-workspace.tsx`, `chat-workspace.tsx`, `conversation-page.tsx`, `conversation-filters.tsx`, `use-conversation-workspace.ts`, `analyst-context.tsx` |
| Testes | `tests/handoff.test.ts`, `handoff-database.ts`, `handoff-ui.ts`; scripts em `package.json` |

## Validação

```sh
npm run typecheck
npm run lint
npm run build
npm run test:backend
npm run test:agent
npm run test:flows
npm run test:handoff
npm run test:handoff:database
npm run test:flows:database
npm run test:agent:database
# Com servidor local e Chrome:
npm run test:handoff:ui
npm run test:agent:ui
```

As suítes unitárias das Fases 2–6 totalizam 56 testes. A integração com Firestore cobre os quatro motivos, resumo, pausa, recibos, concorrência entre analistas, mensagens humanas, retorno/encerramento idempotentes, contexto recuperado em outro processo, confirmação antiga recusada e transferência externa durante uma resposta já em streaming. As regressões anteriores continuam cobrindo limite, duplicidade e confirmações. Chamados críticos já resolvidos podem ser consultados sem iniciar uma nova transferência apenas pela prioridade histórica.

O teste no Chrome usa funcionário, dois analistas e outro funcionário autenticados no Firebase; verifica resumo/chamados no console móvel, disputa por atendimento, mensagens sem LLM, retorno com contexto, encerramento sem resolver chamado e isolamento. A solicitação direta é exercitada no limite de 30 mensagens. O transporte do agente usa Mastra com modelo simulado; Server Actions, autenticação e persistência são reais. Contas e registros temporários são removidos ao final. Nenhuma chamada paga ao LLM é necessária para esses testes.

O escopo termina na Fase 6. Não foi implementada a interface detalhada de auditoria da Fase 7.

Resultado local: TypeScript e build aprovados; 56 testes unitários aprovados; integrações de handoff, fluxos e agente com Firestore aprovadas; teste completo de handoff no Chrome e regressão do chat aprovados. O lint terminou sem erros, com os dois avisos preexistentes em `artifacts/`. Os testes usaram LLM simulado.
