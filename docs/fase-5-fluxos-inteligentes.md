# Fase 5 — Fluxos inteligentes do Nexo Assist

## Arquitetura e lacunas encontradas

As Fases 2–4 já forneciam serviços transacionais de chamados, confirmação com token/digest, busca de artigos, agente único Mastra, ferramentas, streaming, contador e memória persistente. O agente preparava rascunhos, mas descartava a capacidade de confirmação e somente informava que a integração visual viria depois. Faltavam a confirmação pelo chat, a invalidação entre propostas, coleta/seleção estruturada, cards de resultado e proteção explícita de procedimentos condicionados ao ambiente.

Foram mantidos o agente, o endpoint de streaming, o pool MongoDB/Firestore Enterprise, Firebase Authentication e a criação automática pela primeira mensagem. Não há novo banco, dependência ou arquitetura multiagente.

A documentação atual de [ferramentas do Mastra](https://mastra.ai/docs/agents/tools) e [workflows](https://mastra.ai/docs/workflows/overview) foi consultada. A solução mantém `createTool(inputSchema, outputSchema, execute)` e um agente principal. A pausa para confirmação já é representada pelos dados persistidos e por uma Server Action autenticada; outro mecanismo de suspensão/retomada duplicaria esse controle. Não foi criado um workflow por intenção.

## Fluxos implementados

| Fluxo | Comportamento |
| --- | --- |
| Central de ajuda | Busca artigos reais, retorna restrições, pergunta ambiente quando necessário, orienta somente com fonte aplicável e pergunta se resolveu. Procedimentos Windows com versão restrita não retornam conteúdo para ambiente desconhecido ou incompatível. |
| Consulta | Listagem por linguagem natural, títulos/números resolvidos para UUIDs, seleção entre candidatos, detalhes, prazo/vencimento e histórico real de atualizações. As ferramentas consultam exclusivamente chamados autorizados. |
| Abertura | Coleta parcial persistida, classificação INC/REQ e categoria, impacto/urgência, prioridade e SLA determinísticos, busca de duplicados, rascunho, revisão e confirmação explícita. |
| Atualização | Seleção e consulta da versão atual, complemento acrescentado à descrição anterior, rascunho e confirmação. O histórico anterior e o marco de resposta do serviço são preservados. |
| Reabertura | Preparação e confirmação revalidam resolução e limite inclusivo de sete dias. Fora da janela, a operação é recusada e o agente orienta uma alternativa permitida. |
| Cancelamento/revisão | Botão ou ferramenta de cancelamento; alteração exige novo rascunho. Propostas canceladas, substituídas ou expiradas não executam. |
| Atendimento humano | Reutiliza a fila existente com motivo e resumo factual. Pedido explícito, criticidade, vencimento e incerteza são instruídos no agente; consulta de status sinaliza criticidade/vencimento. Confirmar um incidente crítico, um encaminhamento de chamado ou uma operação sobre chamado vencido encaminha também a conversa na mesma transação. Nenhum analista é simulado como responsável. |

Os nomes de tipo/categoria são validados por schemas. A identidade afetada vem da sessão. O modelo interpreta os dados relatados; o serviço calcula a prioridade e o prazo. O prazo é de resposta, não promessa de resolução. O calendário e as regras da Fase 2 permanecem vigentes.

## Estado estruturado e memória

`Conversation.flow` contém intenção, etapa, dados parciais de `TicketData`, ambiente, pergunta, opções rápidas e até cinco UUIDs candidatos. As etapas são `collecting`, `selecting`, `knowledge`, `awaiting_confirmation` e `idle`. Esse estado não altera proprietário, papel, contador, versão de segurança ou permissões.

`updateConversationFlow` persiste a coleta e pergunta antes de solicitar dados. A memória da Fase 4 inclui o estado, o chamado selecionado e o estado atual da proposta. Dados parciais da mesma intenção são preservados quando o modelo acrescenta campos. Respostas como “só eu”, “não” e “é esse” são interpretadas em relação à pergunta/seleção persistida. Ao mudar de intenção, o agente cancela a operação pendente e prepara o novo contexto.

Referências candidatas são verificadas no servidor, e a interface recupera os dados reais pelo usuário autenticado. O modelo não fornece snapshots de chamados para renderização. O adaptador conserva o orçamento de 16.000 caracteres da Fase 4; descrições do estado são limitadas antes de entrar na janela. Não há chamada adicional de sumarização.

## Confirmação e transações

Rascunhos do chat recebem `conversationId`, `sourceRunId`, `controlVersion`, `confirmationMessageId` e `cancelledAt`, além dos dados, digest, validade e recibo já existentes. A preparação valida execução, proprietário e controle da conversa, verifica duplicados, invalida a proposta anterior e vincula a nova proposta à conversa na mesma transação. Apenas uma proposta ativa pode ser preparada por execução.

Há dois contratos de confirmação que convergem para a mesma implementação determinística privada:

- O contrato original da Fase 2 mantém `draftId`, `digest` e token válido.
- O chat usa `confirmConversationDraft({ conversationId, draftId, digest })`, chamado exclusivamente pela interação explícita com o botão em uma Server Action. Não é uma ferramenta do modelo. O servidor autentica o funcionário, verifica o vínculo do rascunho à conversa e o digest dos dados exibidos. A proteção de origem das Server Actions do Next.js permanece ativa.

O digest do card identifica a proposta exibida; não é uma credencial que conceda acesso a dados de outro usuário. Tokens de confirmação não são enviados ao modelo, aos eventos ou à memória. O modelo não pode confirmar com uma mensagem “sim”; esse texto continua sendo entrada conversacional. A escrita exige o comando separado do funcionário.

Antes da execução, o servidor valida novamente:

1. Proprietário, vínculo à conversa, digest, validade e cancelamento.
2. Proposta atual, ausência de execução concorrente da IA e estado operacional permitido.
3. Versão de controle humano, inclusive após um analista assumir e devolver a conversa.
4. Versão/status do chamado, janela de reabertura e duplicidade.

O chamado, evento de histórico, recibo do rascunho, mensagem/card de resultado, evento de confirmação e estado da conversa são gravados na mesma transação. A trava por funcionário e a versão da conversa protegem confirmações simultâneas e corridas com mensagens/analistas. Repetir a mesma confirmação já aplicada devolve o recibo; não cria outro chamado ou mensagem. O cliente bloqueia cliques repetidos e não dispara novamente a operação automaticamente em uma falha.

**Novo envio válido:** ao reservar um novo turno, o servidor invalida a proposta anterior antes de consultar o modelo. Isso também cobre correções, desistências e mudança de intenção durante processamento. Um reenvio com o mesmo UUID é reconhecido antes dessa etapa e não invalida a própria proposta. Para retomar uma proposta invalidada/expirada, o agente reaproveita os dados e prepara uma nova revisão. Essa regra é deliberadamente conservadora: texto livre não preserva silenciosamente uma autorização antiga.

## Integração visual

`ConversationFlowPanel` reutiliza `Button`, Lucide, bordas, cores, tipografia e classes dos cards/listas existentes. Acrescenta opções rápidas, seleção de candidatos e o rascunho com Confirmar operação/Cancelar. `TicketCard` usa o mesmo padrão visual e apresenta resultado/status/prazo reais. A mensagem de resultado persiste o snapshot do recibo; o card do chamado selecionado mostra o estado consultado atualmente.

As leituras iniciais continuam em Server Components. Somente o painel interativo e o hook existente usam estado cliente. A recuperação é autorizada e a interface trata carregamento, operação indisponível, expiração, falhas e nova tentativa explícita. O campo inicial centralizado, Enter/Shift+Enter e a criação automática da conversa foram preservados.

## Transparência e erros

As execuções continuam registrando intenção, ferramentas, validações, referências e resultados sem raciocínio privado. A atualização de coleta identifica `source=model_inference`; prioridade/draft/resultado vêm dos serviços. `conversation_events` acrescenta `draft_prepared`, `draft_invalidated`, `draft_cancelled` e `ticket_confirmed`, com referências à proposta e ao funcionário; confirmações registram o digest apresentado. O histórico do chamado conserva antes/depois das operações.

Erros existentes e novos são tipados: `DUPLICATE_TICKET`, `DRAFT_ALREADY_PREPARED`, `INVALID_CONFIRMATION`, `CONFIRMATION_CANCELLED`, `CONFIRMATION_EXPIRED`, `REOPEN_WINDOW_EXPIRED`, `RUN_IN_PROGRESS`, `HUMAN_CONTROL`, indisponibilidade e conflitos. Uma falha no registro do resultado causa rollback da operação. O card de sucesso é gerado pelo serviço, nunca por uma alegação do modelo.

## Arquivos

| Área | Arquivos |
| --- | --- |
| Contratos | `src/types/domain.ts`, `ai.ts`, `tickets.ts`; `src/server/schemas/tickets.ts`; `src/server/ai/schemas/index.ts` |
| Agente e contexto | `src/server/ai/tools/index.ts`, `prompts/nexo.ts`, `memory.ts`; `src/server/policies/knowledge-guidance.ts` |
| Aplicação e persistência | `src/server/services/tickets.ts`, `src/server/repositories/tickets.ts`, `agent-runs.ts`, `src/server/actions/tickets.ts` |
| Chat | `conversation-page.tsx`, `chat-workspace.tsx`, `use-conversation-workspace.ts`, `conversation-flow-panel.tsx`, `ticket-card.tsx`; `src/lib/ticket-display.ts` |
| Testes | `tests/flows.test.ts`, `flows-database.ts`, `agent-ui.ts`, `agent.test.ts`, `memory-database.ts`, `helpers/ticket-memory.ts`; scripts em `package.json` |

Os campos novos são opcionais para leitura de documentos legados. Rascunhos antigos sem vínculo ao chat mantêm o contrato original; o painel não os converte em confirmações por conversa. Não há migração destrutiva, alteração de IAM ou índice novo necessário para os acessos por identificador desta fase.

## Validação

```sh
npm run typecheck
npm run lint
npm run build
npm run test:backend
npm run test:agent
npm run test:flows
npm run test:flows:database
npm run test:memory:database
npm run test:agent:database
# Com servidor local e Chrome:
npm run test:agent:ui
```

A suíte nova contém 11 cenários agrupados, incluindo os 18 casos pedidos: conhecimento/ambiente, consulta/seleção, vencimento, coleta completa/incompleta, classificação, duplicidade, atualização, reabertura válida/inválida, confirmação, revisão/cancelamento, humano, retomada, isolamento e indisponibilidade. São executados 51 testes unitários no conjunto das Fases 2–5.

A integração de Firestore testa Mastra → preparação → confirmação, rollback após falha ao persistir a mensagem, concorrência/replay, resultado persistido, preservação da atualização, invalidação por nova mensagem, retomada de estado, cancelamento e isolamento. As regressões da Fase 4 verificam recuperação em outro processo e interrupção sem repetir ferramentas; a Fase 3 mantém as verificações de contador e controle humano. O teste do Chrome usa Firebase/Firestore reais e modelo simulado, incluindo opções, rascunho em 390/768/1440 px, confirmação real por Server Action, clique repetido, reload e cancelamento. Contas e dados temporários são removidos no final.

Os testes com LLM simulado verificam os contratos, a execução das ferramentas e as regras críticas. Não medem a qualidade de interpretação de um provedor real para toda frase possível; essa avaliação exige um conjunto próprio de conversas reais. Não foram feitas chamadas pagas ao LLM.

Resultados locais: TypeScript e build de produção aprovados; 51 testes unitários aprovados; integrações de fluxos, memória e agente com Firestore aprovadas; teste de chat no Chrome aprovado. A verificação final de banco também confirmou que acrescentar um campo parcial preserva os dados já coletados. O lint terminou sem erros e com os dois avisos preexistentes em `artifacts/`.

O escopo termina na Fase 5: a fila humana existente é utilizada, sem implementar um novo console de analistas, retorno completo à IA ou interface detalhada de auditoria das Fases 6–7.
