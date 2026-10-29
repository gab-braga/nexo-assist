# Fase 3 — Núcleo do Nexo Assist com Mastra

## Escopo entregue

Um agente `nexoAgent`, ferramentas conectadas aos serviços da Fase 2, endpoint autenticado em streaming e adaptação funcional do chat existente. Sem arquitetura multiagente, RAG, banco adicional ou alteração de layout, cores, tipografia e classes visuais.

Não foram implementados memória avançada/recuperação automática da Fase 4, fluxo visual completo de confirmação da Fase 5, console de transferência da Fase 6 ou interface de auditoria da Fase 7.

## Dependências e provedor

- `@mastra/core` **1.80.0**, versão estável compatível com Node >=22.13 e Zod 4.
- `@ai-sdk/openai` **4.0.96**, fixado no contrato `@ai-sdk/provider` 4.0.29 utilizado pelo Mastra. A versão 4.0.104 introduzia incompatibilidade de tipos; não foram utilizados casts para escondê-la.
- Um provedor: OpenAI Responses API, modelo padrão configurável `gpt-5.4-mini`. Chave exclusivamente no servidor, sem variáveis NEXT_PUBLIC.

```dotenv
OPENAI_API_KEY=definir-localmente
NEXO_AI_MODEL=gpt-5.4-mini
```

Escolha inicial: modelo menor, com function calling, streaming e saídas estruturadas, adequado para avaliar custo/latência de um domínio limitado. Não há comparação empírica com outros modelos nem garantia de qualidade sem avaliação; limites de saída e contexto favorecem custo, com possível perda de nuances. Não há fallback automático de provedor. A API recebe `store: false` e esforço de raciocínio baixo. Isso não substitui a avaliação das políticas de dados do provedor antes de produção.

Fontes consultadas: [modelo OpenAI](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [ferramentas Mastra](https://mastra.ai/docs/agents/tools), [streaming Mastra](https://mastra.ai/docs/guides/streaming), [integração Next.js](https://mastra.ai/integrations/frameworks/next-js). Os tipos da versão instalada foram usados como contrato final; APIs de documentação mais recente não foram assumidas como disponíveis.

## Arquitetura

```text
Chat existente → POST /api/agent → serviço de turnos
                                    ├─ sessão/ownership/limites
                                    ├─ contexto recente do banco
                                    └─ Mastra → ferramentas → serviços da Fase 2
                                                    ↓
                                    resultados, decisões e validações
                                                    ↓
                             agent_runs + messages no banco existente
```

`src/server/ai/` é server-only. O registro Mastra não é exposto por catch-all nem disponibiliza endpoints genéricos de tools. Logger interno desativado; os logs próprios contêm somente runId, classe do erro, status e código sanitizado do provedor. Prompts, chamadas completas, tokens e corpos de erro não são registrados.

Segurança e contexto estão separados:

- Mensagens recentes compõem o contexto conversacional do LLM.
- `RequestContext` carrega uma instância de `NexoRunContext`, criada apenas no servidor, com identidade, conversa, run, sinal de cancelamento e callbacks privados.
- Os serviços existentes continuam obtendo a identidade da sessão. Cada ferramenta verifica que ela coincide com o contexto e que a conversa ainda permite IA.
- O modelo nunca escolhe UID, role, cookie, permissões ou versão de controle. Campos extras de requisição e de ferramentas são rejeitados por schemas estritos.
- Operação humana/estado persistido permanecem no banco, não no prompt.

O factory de agente permite injetar um modelo controlado em testes. A aplicação usa somente a instância de produção com OpenAI.

## Ferramentas

Todas usam `createTool`, Zod, resultado `ok/data` ou `ok/code/error`, autorização no servidor e serviços existentes.

| Ferramenta | Responsabilidade |
|---|---|
| `recordDecision` | Intenção declarada pelo modelo e justificativa curta, sem raciocínio interno |
| `searchKnowledgeBase` | Artigos reais e condições de aplicabilidade |
| `listUserTickets` | Consulta de chamados próprios, filtros e paginação |
| `getTicketDetails` | Detalhes autorizados por UUID |
| `getTicketStatus` | Status, prioridade, SLA e vencimento reais |
| `findDuplicateTickets` | Candidatos próprios abertos/resolvidos recentes |
| `evaluateTicketPriority` | Reutiliza a política determinística da Fase 2 |
| `prepareTicketDraft` | Prepara create/update/reopen/handoff sem efetivar chamado |
| `requestHumanHandoff` | Encaminha a conversa à fila e pausa próximas execuções |

O agente interpreta as nove intenções solicitadas dentro da própria execução. Não há classificador LLM separado. Registro de intenção é declaração do modelo, não garantia de classificação correta; resultados de tools e validações são evidências separadas.

### Escritas e confirmação

O serviço de rascunhos da Fase 2 retorna um token e digest verificáveis. A ferramenta **remove ambos antes de retornar ao modelo**. Não existe ferramenta `confirmTicketChange`, `createTicket`, `updateTicket` ou `reopenTicket` livremente executável pelo LLM. As três escritas são preparadas por `prepareTicketDraft`; execução continua pertencendo ao comando determinístico e autenticado da Fase 2.

Um “sim” escrito no chat não é convertido em confirmação. O modelo não recebe capacidade de gerar aprovação válida. A interface de confirmação não foi adicionada antecipadamente: o chat informa que o rascunho aguarda o fluxo autorizado. Como o token de preparação do agente não é exposto ao cliente nesta fase, a futura integração deve manter essa capacidade fora do contexto do modelo; não é possível confirmar esse rascunho apenas pelo ID. Se necessário, preparar novamente pela entrada autenticada da Fase 2 para obter uma nova capacidade.

O texto final após preparação é montado dos dados validados do serviço, explicitando que nenhum chamado foi criado/alterado. Isso impede que uma preparação bem-sucedida seja apresentada como escrita concluída. O fluxo completo de revisão/edição/confirmar está reservado à Fase 5.

`requestHumanHandoff` não altera chamados. Marca a conversa, registra motivo/resumo e bloqueia novas ferramentas daquela execução. O texto final de transferência é determinístico. Encaminhamento de um chamado específico continua exigindo confirmação pelo serviço da Fase 2.

## Endpoint e interface

`POST /api/agent`, Node runtime, recebe somente:

```json
{
  "requestId": "UUID idempotente",
  "conversationId": "UUID da conversa",
  "text": "Mensagem do funcionário"
}
```

Exige cookie Firebase válido, role chat, ownership, origem igual à origem pública da requisição e Content-Type JSON. Proxy de hospedagem deve preservar a origem pública corretamente; não são aceitas origens arbitrárias por headers do cliente. Corpo é limitado a 20 KB mesmo sem Content-Length, e texto mantém limite de 8.000 caracteres.

### Início de conversa pela primeira mensagem

Na tela inicial, o mesmo campo aceita a primeira mensagem, sem formulário de assunto. O cliente gera `conversationId` e `requestId` uma vez e acrescenta `startConversation: true` ao corpo acima. O servidor valida mensagem/sessão antes de criar qualquer registro e grava a conversa, a mensagem e a reserva do run na mesma transação. A action antiga de criação vazia foi removida; o repository interno continua disponível para persistência transacional e fixtures.

O título usa até dez palavras e 80 caracteres da primeira mensagem, normalizando espaços e preservando Unicode; não usa LLM. `initialMessageId` vincula a conversa ao primeiro envio e impede que outra requisição seja tratada como primeira mensagem daquela conversa. Colisões e concorrência não disparam outro run; resultado já concluído é devolvido pelo recibo existente.

O evento `started` inclui `conversationId`. Depois da confirmação do banco, a URL muda pela History API integrada ao Next.js e o chat existente exibe a primeira mensagem/stream sem remount ou efeito que reenvie a mensagem. Ao concluir, Server Components recuperam o estado persistido. Falhas antes da criação mantêm a tela e o texto; falhas depois da gravação conservam o texto e o vínculo com a conversa. Resultado incerto mantém os mesmos IDs na nova tentativa. “Novo atendimento” limpa o campo e aguarda a navegação antes de aceitar outra mensagem, evitando enviá-la à conversa anterior.

O teste `test:agent:database` cobre primeira mensagem, concorrência, replay, título e rollback com Firestore e Mastra simulado. `test:agent:ui` também verifica campo centralizado em 390/768/1440 px, teclado, persistência ao recarregar, continuidade, ausência de conversas vazias, falha anterior à criação, perda da resposta depois do commit e falha do provedor. A revalidação final desse teste no navegador ficou pendente: a revisão automática de permissão expirou duas vezes; no sandbox, o runtime `tsx` falhou em `os.userInfo`. TypeScript, lint do código ativo, build, 32 testes locais e integração de banco passaram nesta refatoração. Não foram feitas novas chamadas pagas ao modelo.

NDJSON do produto, sem exposição do stream interno Mastra:

- `started`: runId.
- `delta`: texto incremental.
- `completed`: mensagem autoritativa persistida.
- `error`: código e mensagem sanitizada.

Erros antes do início recebem status HTTP apropriado; após o início, evento de erro. Cache desativado. Cancelamento do cliente propaga um AbortSignal. Erros de provedor e timeouts não geram mensagem persistida de sucesso.

O hook existente envia `fetch`, reconcilia IDs e usa as mesmas bolhas para carregamento, texto incremental e resultado final. Falha preserva a entrada e exibe o alerta existente. Em falha terminal conhecida, o próximo clique é nova tentativa explícita; em resultado incerto de rede, o UUID é mantido para reconciliação. Usuário não precisa interpretar detalhes técnicos.

As únicas mudanças de apresentação são textos funcionais do estado de IA e autoria assistant nos componentes já existentes. Componentes/classes/estrutura visual são preservados. Mensagens humanas continuam pelas Server Actions existentes. O console apenas reconhece a autoria IA usando o estilo `ai` já disponível; não foram acrescentados controles da Fase 6.

## Estado mínimo, limites e concorrência

Conversas novas recebem `aiEnabled=true`. Conversas antigas sem esse campo mantêm o comportamento humano; não houve conversão automática de dados históricos. Estados waiting/active/closed existentes são preservados.

IA só executa em conversa própria habilitada, waiting, sem analista e sem `aiHandoff`. Assumir/liberar/encerrar incrementa `aiControlVersion`, invalidando execuções anteriores inclusive no ciclo assumir→liberar. Tools e publicação revalidam o controle; respostas obsoletas não são persistidas. Após handoff, o funcionário pode continuar escrevendo para a fila humana pelo mecanismo existente. Retorno explícito à IA será tratado na Fase 6.

Limites fixos, centralizados em `config.ts`:

- 30 mensagens inéditas do funcionário que iniciam execução IA por conversa; respostas, eventos e replay não contam. Falhas depois da reserva contam como tentativa; requisições inválidas/não autorizadas não contam. Reinício não zera contador. Esta é a interpretação de sessão adotada.
- Uma execução ativa por conversa, adquirida transacionalmente.
- Até seis passos de modelo, oito ferramentas e 2.048 tokens de saída por passo; sem retries automáticos do provedor.
- Tempo total sinalizado de 60 segundos; limite de função de 70 segundos.
- Até 20 mensagens recentes, 4.000 caracteres por mensagem e 16.000 caracteres totais de histórico.
- Lista de chamados: até cinco por chamada, sem descrições extensas; duplicados: até dez resumos; conhecimento: até seis artigos, 2.000 caracteres por conteúdo, indicando truncamento.

`agent_runs` guarda ID idempotente, hash do texto, dono, conversa, versão de controle, estado, validade, resposta, auditoria, versão do prompt/modelo e consumo básico. Não é storage de memória Mastra. Histórico reaproveita `messages`, com autoria assistant separada das roles Firebase.

Reserva do run, contador e mensagem do funcionário são atômicos. Mesma requisição concluída retorna recibo sem chamar o modelo novamente. Mesma chave com payload diferente é conflito. Falha terminal não é repetida automaticamente. Execução abandonada expira e uma nova mensagem pode adquirir o controle; retomada automática e recuperação avançada não fazem parte desta fase. Não há garantia de continuidade de geração se o processo morrer.

Não existe rate limit global entre todas as conversas de um UID nesta fase; o limite é de sessão/conversa e execução. Considerar um limite global antes de disponibilizar publicamente.

## Rastreabilidade

Cada run correlaciona conversa, mensagem, modelo/prompt, datas, sucesso/falha e uso. Eventos distinguem:

1. `model_decision`: intenção/justificativa declaradas.
2. `tool_result`: ferramenta executada e referências de evidência.
3. `service_validation`: bloqueio/falha determinística, com código.

Parâmetros guardados são minimizados: IDs, tipo, categoria, impacto, urgência, status e comprimento de busca. Não se guardam payloads integrais, token de confirmação nem texto completo de artigos nas traces. Justificativa é curta e não constitui raciocínio privado. Não são gerados percentuais de confiança. A interface detalhada e políticas completas de retenção ficam para a fase apropriada.

A interpretação de linguagem natural e aplicabilidade das fontes ainda exige avaliação de qualidade. Segurança de ownership, confirmação e escrita permanece determinística mesmo se o modelo escolher mal uma ferramenta.

## Arquivos

| Criados | Função |
|---|---|
| `src/server/ai/agents/nexo-agent.ts` | Agente e composição testável |
| `src/server/ai/{index,config,context,http}.ts` | Registro, limites, contexto seguro e entrada HTTP |
| `src/server/ai/prompts/nexo.ts` | Instruções versionadas |
| `src/server/ai/schemas/index.ts` | Contratos do turno/intenção/resultado |
| `src/server/ai/tools/index.ts` | Tools sobre serviços existentes |
| `src/server/services/agent-turns.ts` | Execução, streaming e tratamento de erros |
| `src/server/repositories/agent-runs.ts` | Reserva, contador, auditoria e publicação transacionais |
| `src/app/api/agent/route.ts` | Endpoint protegido |
| `src/types/ai.ts`, `src/lib/agent-stream.ts` | Eventos tipados e consumidor NDJSON |
| `tests/agent.test.ts`, `tests/helpers/scripted-model.ts` | Contratos, Mastra real e modelo simulado |
| `tests/agent-database.ts` | Integração real do banco com modelo simulado |
| `tests/agent-ui.ts` | Chat autenticado no navegador, transporte interceptado somente em teste |
| `tests/agent-live.ts` | Smoke opcional com Firebase e OpenAI reais |

Modificados: package.json/lock, .env.example, script de índices, tipos de domínio, criação/transições de conversas, hook e workspaces existentes, README. Não foram recriados os serviços de chamados ou conhecimento.

## Validação

```sh
npm run typecheck
npm run lint
npm run test:backend
npm run test:agent
npm run test:agent:database
npm run build
# Com servidor local e Chrome:
npm run test:ui
npm run test:agent:ui
# Somente com chave/saldo e autorização para consumir API:
npm run test:agent:live
```

`TEST_BASE_URL` permite usar outra porta local. Testes de banco/UI/live criam registros e contas isolados por UUID e os removem ao final. A suíte padrão não chama LLM pago; o teste live é comando separado.

Os testes com modelo roteirizado comprovam integração Mastra, execução/autorização das ferramentas, tratamento de respostas e erros. Não comprovam, por si só, que um LLM real escolherá sempre a intenção correta em linguagem natural.

Na validação desta fase, 31 testes locais passaram, assim como integração de agente no Firestore e build. TypeScript e lint do código ativo passaram; lint completo mantém dois avisos preexistentes em scripts históricos. Verificações anônimas de UI passaram. O teste autenticado de chat é executado com NDJSON interceptado, sem custo de provedor.

### Bloqueio externo constatado

A chave configurada conseguiu consultar o modelo (`GET /v1/models/gpt-5.4-mini`, HTTP 200), mas a geração real pelo endpoint autenticado retornou **HTTP 429 / `credit_balance_exhausted`**, antes de executar ferramentas. Não houve sucesso de inferência real nem avaliação semântica do modelo nesta conta. Contas/artigos/conversas temporários foram removidos. Nenhuma alteração de cobrança foi feita e chamadas pagas não foram repetidas após identificar o bloqueio.

Quando houver saldo disponível, executar o smoke live para concluir essa verificação. A aplicação apresenta indisponibilidade sem expor o corpo do erro do provedor.

Permissão de criação de índices (`datastore.indexes.create`) permanece pendente desde a Fase 2. O índice adicional de `agent_runs` foi incluído no script; não foram alteradas permissões IAM. As operações por IDs e os testes transacionais funcionaram no banco atual.
