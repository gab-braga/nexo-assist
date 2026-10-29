# Fase 7 — Transparência, rastreabilidade e observabilidade

## Arquitetura e decisões

A implementação mantém o agente, as ferramentas, os serviços de chamados, o controle humano e o transporte NDJSON existentes. Não adiciona dependências, coleções, exportadores externos ou chamadas ao modelo para explicar decisões.

`agent_runs.audit` continua sendo a fonte canônica das execuções. Cada chamada de ferramenta recebe um UUID, sequência, estado, início, duração, parâmetros permitidos e evidências limitadas do resultado real. A conversa, a mensagem de entrada e a resposta são identificadas pelo documento da execução. O mesmo evento é atualizado no início e no fim, sem criar duas ações no histórico. A atualização transacional preserva estados terminais e mescla registros concorrentes, inclusive durante o handoff.

O início é persistido **antes** de chamar o serviço. Se esse registro falhar, a operação não começa. Se o resultado não puder ser persistido depois da execução, o estado é desconhecido, sem declarar sucesso ou repetir escritas. Ao finalizar ou recuperar uma execução expirada, ações ainda em andamento tornam-se desconhecidas. O resultado confirmado do serviço e os recibos transacionais permanecem as autoridades sobre alterações de negócio.

As operações confirmadas são projetadas dos `ticket_drafts` aplicados e dos respectivos eventos `ticket_confirmed`. O vínculo `messageId` foi acrescentado aos eventos existentes; registros antigos também podem ser ligados pelo `draftId`. As transferências usam os eventos e a mensagem de aviso da Fase 6. Nenhuma coleção paralela replica esses eventos.

## Transparência funcional

O DTO público em `src/lib/schemas/agent-actions.ts` contém identidade, correlação, origem, estado, título, resumo, horário, duração, detalhes e evidências. Os estados são `running`, `succeeded`, `failed`, `not_started` e `unknown`.

As origens distinguem interpretação do modelo, regra determinística e resultado do serviço. A classificação de impacto e urgência continua sendo uma proposta quando extraída pelo modelo; a explicação da prioridade descreve a regra aplicada aos dados considerados, sem afirmar que esses dados foram verificados independentemente.

As justificativas são construídas no servidor:

- Prioridade: impacto e urgência efetivamente enviados à função determinística.
- Conhecimento: artigos retornados e condições de compatibilidade calculadas pelo serviço; ausência de ambiente pede informação adicional.
- Duplicidade: candidatos realmente retornados, paginação parcial e bloqueio `DUPLICATE_TICKET`; a consulta nunca significa que um chamado foi criado.
- Rascunho: proposta aguardando confirmação, sem alteração de chamado.
- Confirmação: rascunho aplicado e recibo transacional, associados à mensagem de resultado.
- Handoff: motivo registrado pelo servidor; incerteza é apresentada como avaliação, sem percentual de confiança.
- Falhas: resultado não confirmado, indisponibilidade ou validação impedindo a operação.

O texto livre de justificativa do modelo não é armazenado na nova auditoria nem apresentado como explicação. Históricos antigos sem fatos suficientes informam essa limitação, em vez de reconstruir resultados.

## Streaming e interface

`action-stream.ts` intercala notificações de ações e chunks do Mastra na mesma resposta NDJSON. Não aguarda o resultado da ferramenta para anunciar uma operação cujo início já foi persistido. O cliente substitui ações pelo UUID e mantém seus estados, evitando duplicação no início/fim.

`AgentActions` é compartilhado entre chat e console e aparece antes da resposta correspondente. Mostra um resumo das últimas três ações e detalhes expansíveis nativos (`details`/`summary`), operáveis pelo teclado. Usa as cores existentes, Tailwind e Lucide, sem redesenhar as páginas. O funcionário vê explicações operacionais; o analista também pode expandir o nome da ferramenta e o diagnóstico permitido.

A prévia do envio é criada fora da transição React para não ficar retida até o término do stream. No console, o alinhamento inferior usa `safe end`: preserva a posição em históricos curtos e permite alcançar o início quando ações expandidas aumentam o conteúdo.

Falhas sem resposta concluída são associadas à mensagem de entrada. O texto digitado continua preservado. O histórico persistido recupera os estados após atualização da página; não depende exclusivamente da memória do navegador.

## Mastra e diagnóstico técnico

Foi inspecionada a documentação da versão instalada, `@mastra/core` 1.80.0. A execução usa o `runId` da aplicação no `agent.stream`. O contexto nativo de ferramentas fornece `agent.toolCallId`, referências válidas de trace/span e `observe.log`. O adaptador aproveita esses identificadores quando disponíveis e envia ao logger nativo somente IDs, ferramenta, código de erro, estado e duração, sem entradas ou saídas brutas. O consumo vem de `output.usage`, já persistido na execução.

O projeto não possui `@mastra/observability` nem coletor/exportador configurado. Nesse cenário, o logger de observabilidade nativo pode ser um no-op e IDs de trace não são inventados. Não se afirma que tracing externo completo esteja habilitado. A auditoria funcional e as métricas da execução permanecem disponíveis sem instalar infraestrutura adicional.

No console, o diagnóstico recupera somente modelo configurado, UUID da execução, duração total, consumo informado e referência válida de trace, quando houver. Não exporta traces completos, prompts, chain-of-thought ou corpos de erro do provedor.

## Segurança e limites

`getMessages` autentica e autoriza a conversa antes da recuperação da transparência. As consultas de execuções e propostas também filtram proprietário e conversa. As evidências vêm de ferramentas que já verificam o proprietário do chamado; não há endpoints públicos novos para consultar IDs de evidência.

Os parâmetros são uma lista permitida de enums e valores limitados. Resultados são resumidos em até seis artigos, cinco chamados e referências de rascunho. Não são registrados corpos de artigos, descrições de chamados, dados de contato, tokens de confirmação, digests ou credenciais. Os textos permitidos também passam por redação de padrões de segredo; conteúdo externo é apresentado como texto React, nunca executado como instrução ou HTML.

Cada execução guarda no máximo 24 registros e mantém o limite existente de oito chamadas. A recuperação usa a janela existente de até 50 mensagens, com consultas em lote limitadas a 50 execuções, 50 propostas aplicadas e 100 eventos de negócio. A paginação do histórico permanece existente. Uma resposta fora da janela não tem suas ações duplicadas na mensagem de entrada.

Se a leitura da auditoria falhar, as mensagens continuam disponíveis com aviso específico. Se um processo morrer durante uma chamada, o último início persistido será recuperado como desconhecido quando a execução expirar; não se fabrica conclusão. A persistência incremental custa duas atualizações pequenas por ferramenta em troca dessa rastreabilidade.

## Arquivos principais

| Área | Arquivos |
| --- | --- |
| Contratos | `src/types/ai.ts`, `src/types/domain.ts`, `src/lib/schemas/agent-actions.ts`, `src/lib/agent-stream.ts` |
| Projeção e explicações | `src/server/policies/agent-actions.ts` |
| Instrumentação e transporte | `src/server/ai/context.ts`, `src/server/ai/tools/index.ts`, `src/server/ai/action-stream.ts`, `src/server/services/agent-turns.ts` |
| Persistência e recuperação | `src/server/repositories/agent-runs.ts`, `handoff.ts`, `agent-transparency.ts`, `tickets.ts`; `src/server/services/conversations.ts`, `tickets.ts` |
| Interface | `src/components/conversation/agent-actions.tsx`, `chat-workspace.tsx`, `agent-workspace.tsx`, `use-conversation-workspace.ts` |
| Testes | `tests/transparency.test.ts`, `tests/transparency-integration.ts`, adaptação do repositório simulado em `tests/agent.test.ts` |

## Validação

```powershell
npm run typecheck
npm run lint
npm run test:backend
npm run test:agent
npm run test:flows
npm run test:handoff
npm run test:transparency
npm run test:agent:database
npm run test:handoff:database
# Com servidor local na porta 3100, Chrome e credenciais locais de teste:
npm run test:transparency:integration
npm run build
```

O teste de integração usa Authentication e Firestore reais, contas/dados temporários e Mastra com modelo simulado. Uma ponte de `fetch` exclusivamente no navegador do teste transmite cada evento por demanda; não modifica endpoints da aplicação nem introduz bypass de autenticação. O início da consulta fica bloqueado de forma controlada para verificar que o estado em andamento aparece antes do resultado. Ao final são removidos contas, conversas, mensagens, execuções, eventos, propostas e chamados pertencentes ao namespace do teste.

Resultados executados:

- 64 testes unitários passaram. Após os últimos ajustes de prioridade e erro desconhecido, os 19 testes diretamente relacionados ao agente e à transparência passaram novamente.
- Integrações de banco do agente e do handoff passaram.
- Integração da Fase 7 passou: progresso antes do resultado, persistência, associação à mensagem, recarga, replay sem invocação do modelo, prioridade, confirmação real, duplicidade, falha com resultado desconhecido, transferência, diagnóstico do analista, isolamento, layout móvel e recuperação de execução expirada.
- Regressões de interface do agente e do handoff passaram, incluindo envio inicial, falhas, confirmação, disputa entre analistas e troca humano/IA.
- TypeScript e build de produção passaram. Lint sem erros, com dois avisos preexistentes nos scripts históricos de `artifacts/`.

Os testes usaram modelo simulado, sem consumir chamadas pagas. Contas e dados temporários foram removidos. A Fase 8 não faz parte desta alteração.
