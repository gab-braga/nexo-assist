# Fase 4 — Conversas, memória e persistência

## Decisão de arquitetura

O Mastra instalado continua executando o mesmo agente, ferramentas e streaming. `src/server/ai/memory.ts` converte o histórico autorizado em mensagens `CoreMessage` passadas a `agent.stream()`. O Firestore Enterprise, acessado pelo pool MongoDB existente, permanece como único armazenamento.

Foram consultados os tipos da versão instalada e a documentação de [memória](https://mastra.ai/docs/memory/overview), [Memory](https://mastra.ai/reference/memory/memory-class) e [MongoDBStore](https://mastra.ai/integrations/databases/mongodb). A memória nativa exige pacote/adaptador adicional, com estruturas próprias de threads e mensagens. A compatibilidade desse storage com o Firestore Enterprise não foi validada. Nesta arquitetura, adotá-lo também criaria outro responsável por persistir o histórico, fora das transações já existentes. O adaptador explícito evita essa duplicação, sem dependências novas. Isso não significa que o storage nativo seja incompatível.

## Dados e responsabilidades

- **Memória conversacional:** mensagens persistidas, problema inicial e contexto recente; não contém raciocínio privado do modelo. As justificativas objetivas e resultados de ferramentas continuam no registro de auditoria existente.
- **Estado operacional:** campos de `Conversation`, referências `selectedTicketId`/`pendingDraftId`, contador e controle da execução. Os serviços validam as mudanças; a memória não autoriza escritas.
- **Segurança:** identidade Firebase, autorização por recurso e versão de controle humano verificadas no servidor. O cliente e o modelo não recebem capacidades de confirmação pelo adaptador.

O repository `agent-runs` reserva execução, mensagem e incremento de contador na mesma transação. A conversa só é criada na primeira mensagem válida. UUID e hash do conteúdo vinculam o reenvio ao recibo original. `remember()` aceita somente referências internas tipadas, verifica o proprietário e persiste a referência usada na execução. Não é uma ferramenta genérica exposta ao modelo.

As ferramentas de consulta de chamado atualizam o chamado selecionado; a preparação de rascunho atualiza a operação pendente. Cada leitura recupera o estado real do rascunho (`pending`, `expired`, `applied`) e do chamado, filtrando pelo funcionário. Rascunho não equivale a confirmação. Tokens e digests não entram no contexto. A confirmação de operações permanece na camada determinística da Fase 2; a experiência avançada pertence à Fase 5.

## Estados e limite da sessão

Os quatro estados são derivados dos campos persistidos existentes, evitando duas fontes de verdade:

| Estado lógico | Campos existentes |
| --- | --- |
| `AGENT_ACTIVE` | `waiting`, IA habilitada, sem handoff e sem analista |
| `WAITING_FOR_ANALYST` | `waiting` com handoff, IA desabilitada ou conversa legada |
| `ANALYST_ACTIVE` | `active` |
| `CLOSED` | `closed` |

Conversas legadas não passam a usar IA automaticamente. Assumir/devolver/encerrar mantém o versionamento de controle humano. Devolver à fila mantém o atendimento humano; não foi implementado retorno automático ao agente nem o fluxo completo da Fase 6.

**Interpretação do limite:** uma sessão é uma conversa. Contam os envios do funcionário aceitos para processamento pela IA, incluindo execuções que falham ou são interrompidas depois da reserva. Respostas da IA, mensagens do analista e mensagens na fila humana não contam. Reenvios com o mesmo identificador não incrementam. A 31ª mensagem é rejeitada antes do modelo; o contador não é resetado por reload, restart ou transferência. Uma nova conversa começa outra sessão somente quando recebe a primeira mensagem válida. O endpoint de mensagem humana rejeita tentativas de contornar o limite em uma conversa com IA ativa.

## Contexto e desempenho

O adaptador mantém a mensagem atual (até 8.000 caracteres), fixa o problema inicial (até 3.000), inclui dados operacionais autorizados (até 2.500) e preenche o restante com as mensagens mais recentes. O orçamento total é de 16.000 caracteres, com até 20 mensagens recentes e corte por mensagem. Não há chamada adicional ao LLM, sumarização, busca entre funcionários ou histórico ilimitado. Dados de artigos, chamados e mensagens não são instruções de segurança. Quando a conversa muda de assunto, o histórico recente e a mensagem atual continuam presentes; o problema inicial não é um resumo semântico de todos os assuntos.

Novas mensagens recebem `sequence` monotônica dentro da transação, usando a versão da conversa; lacunas são esperadas quando outras operações incrementam a versão. O histórico pagina por sequência e passa aos documentos legados por data/UUID. Não há reescrita de mensagens antigas. O índice composto adicional está declarado em `scripts/setup-database.ts`; o índice legado permanece. O teste real confirmou a consulta paginada no banco configurado. Em ambientes que exigem criação explícita de índice, execute `npm run db:setup` com uma identidade que tenha permissão administrativa de índices; nenhuma alteração de IAM foi feita.

## Streaming e recuperação

A mensagem do funcionário é gravada antes do modelo com `runId` e estado `processing`. Deltas são exibidos em blocos, sem gravar uma mensagem por token. Somente a resposta concluída é persistida; sequência, data e UUID do recibo são preservados em reenvios. Mensagens guardam referências aos eventos objetivos da execução.

Uma interrupção descarta a prévia parcial, mantém a mensagem do funcionário e marca a execução/mensagem como `interrupted`. A desconexão tenta concluir esse registro no `finally`; após queda do processo, a leitura da conversa ou outro envio recupera a execução ao expirar o lease. Não há job de recuperação nem reexecução automática de ferramentas. Um rascunho preparado antes da interrupção permanece no banco e no contexto. A interface reaproveita o alerta existente para indicar processamento, falha ou interrupção após reload.

Falhas temporárias de conexão ao banco e commits com resultado desconhecido recebem `PERSISTENCE_UNAVAILABLE`, sem expor a mensagem original. Uma falha inesperada do transporte recebe `STREAM_INTERRUPTED`. O cliente conserva o identificador do envio para reconciliar um resultado incerto. Se a gravação do estado de interrupção também falhar, o lease permite recuperação posterior. Conversas encerradas ou sob controle humano bloqueiam novos turnos da IA. O histórico segue as políticas de acesso existentes para funcionários e analistas.

## Arquivos principais

| Responsabilidade | Arquivos |
| --- | --- |
| Contratos e estados | `src/types/domain.ts`, `src/types/ai.ts`, `src/auth/conversation-state.ts` |
| Memória e referências | `src/server/ai/memory.ts`, `context.ts`, `schemas/index.ts`, `tools/index.ts`, `prompts/nexo.ts` |
| Transações e recuperação | `src/server/repositories/agent-runs.ts`, `conversations.ts` |
| Histórico e integração | `src/server/services/conversations.ts`, `agent-turns.ts`, `src/server/policies/message-history.ts`, `src/app/api/agent/route.ts` |
| Interface existente | `conversation-page.tsx`, `chat-workspace.tsx`, `use-conversation-workspace.ts`, `src/lib/agent-stream.ts`, `message-processing.ts` |
| Índices e erros | `scripts/setup-database.ts`, `src/server/lib/errors.ts` |
| Testes | `tests/memory.test.ts`, `memory-database.ts`, `helpers/context-reader.ts`, `agent.test.ts`, `agent-database.ts`, `agent-ui.ts` |

## Validação

```sh
npm run typecheck
npm run lint
npm run build
npm run test:backend
npm run test:agent
npm run test:agent:database
npm run test:memory:database
# Com servidor local e Chrome:
npm run test:agent:ui
```

Os testes unitários usam modelos simulados. As integrações de banco criam UUIDs e proprietários temporários e removem seus registros no final. A recuperação após restart é exercitada em outro processo Node, sem compartilhar memória da aplicação. A integração de memória verifica contexto recebido pelo Mastra, isolamento, estados do rascunho, interrupção após ferramenta, reenvio sem repetir a ferramenta, contador e paginação mista. A suíte anterior de banco verifica criação atômica, concorrência, limite de 30 e controle humano. O teste de UI usa Firebase/Firestore reais e intercepta apenas o transporte/provedor do agente, sem consumo pago do LLM.

Não foram adicionados banco, cache, dependências, migração destrutiva, política de retenção, interface de auditoria ou fluxos das Fases 5–7. A retenção continua seguindo a política já existente do projeto; este trabalho não implementa anonimização ou exclusão automática.

### Resultado da validação local

Passaram TypeScript, build de produção, os 40 testes unitários, a integração anterior do agente com o banco, a nova integração de memória e o teste de chat no Chrome. O lint apresentou somente dois avisos preexistentes em `artifacts/`. O teste de navegador também verifica uma execução expirada após reload, sem invocar novamente o modelo. Nenhuma chamada paga ao provedor foi utilizada.
