# Fase 2 — Serviço de chamados e central de ajuda

Implementação independente de Mastra/LLM. Interface, autenticação e domínio de conversas preservados. Nenhuma dependência nova.

## Arquitetura

`Server Action → service autenticado → repository transacional → Firestore Enterprise/MongoDB`.

O serviço obtém o usuário com `requireUser`, inclusive quando chamado sem uma action. Identidade não é argumento de requisição. O factory de composição permite injetar autenticação, relógio e repository exclusivamente no servidor/testes; ferramentas futuras devem usar a instância de produção `ticketService`, sem fornecer identidades.

Chamado é uma entidade separada de conversa. Não foram adicionados estado bot, execução IA ou alteração no fluxo humano atual. Encaminhamento desta fase modifica o chamado para `waiting_human` e registra motivo; a futura transferência de conversa/pausa da IA será uma integração distinta.

## Operações

`src/server/services/tickets.ts` e as actions correspondentes disponibilizam:

| Operação | Acesso |
|---|---|
| `listMyTickets` | Funcionário; dono obtido da sessão |
| `getTicket`, `getTicketHistory` | Dono ou analista |
| `listAdministrativeTickets` | Analista; filtro opcional de funcionário |
| `findPossibleDuplicates` | Funcionário; abertos e resolvidos nos últimos sete dias, apenas próprios |
| `prepareTicketChange` | Funcionário; create/update/reopen/handoff |
| `confirmTicketChange` | Mesmo funcionário que preparou; token e digest do rascunho |
| `resolveTicket` | Analista; versão e motivo obrigatórios |

`listMyTickets({overdue: true})` e o equivalente administrativo consultam vencidos. Lista aceita status, pesquisa literal por título/número, cursor data/ID e limite até 50. Histórico retorna alterações relevantes com antes/depois e ator.

Não há criação/edição genérica com campos privilegiados nem endpoint que aceite `customerId` como prova de identidade. Analistas consultam chamados e registram resolução; não podem confirmar rascunhos em nome do funcionário.

## Preparação e confirmação

Exemplo conceitual para um consumidor autenticado das actions:

```ts
const prepared = await prepareTicketChange({
  operation: "create",
  data: {
    title: "VPN com erro 809",
    description: "Windows 11 não conecta à VPN corporativa.",
    type: "INC",
    category: "Rede e VPN",
    impact: "person",
    urgency: "blocked",
  },
});
// Apresentar prepared.data ao funcionário. Somente após sua confirmação:
if (prepared.ok) {
  await confirmTicketChange({
    draftId: prepared.data.draftId,
    digest: prepared.data.digest,
    token: prepared.data.token,
  });
}
```

O exemplo ilustra duas etapas; um consumidor não deve chamar confirmação automaticamente após preparação. A interface atual não foi ligada a esses endpoints nesta fase.

Rascunho persistido por 30 minutos, imutável e vinculado a dono, operação, alvo, versão, payload e token aleatório de 256 bits. Servidor guarda hash do token. Alterar dados exige preparar outro rascunho. Não basta enviar `confirmed: true`. O token não é prova de identidade: também exige sessão correta. Não registrar token em logs. Futuras ferramentas do modelo devem receber preparação, não acesso irrestrito à confirmação, que pertence à interação explícita do usuário.

Confirmação valida novamente autorização, prazo de reabertura, versão e duplicidade. Grava chamado, evento e consumo/resultado do rascunho na mesma transação. Repetir a mesma confirmação retorna o resultado original mesmo após expiração da janela inicial, sem repetir efeitos. Conservar rascunhos aplicados como recibos; não adicionar TTL indiscriminadamente.

## Regras

- Tipos INC/REQ e seis categorias do PRD; título, descrição, impacto e urgência obrigatórios. Afetado é o funcionário autenticado; prioridade é calculada no servidor, não recebida como decisão do cliente.
- Equipe/empresa parada: crítica. Pessoa impedida de trabalhar ou compromisso no dia: alta. Com alternativa: média. Sem urgência: baixa.
- Crítica: uma hora corrida. Alta: quatro horas úteis. Média: três dias úteis. Baixa: cinco dias úteis.
- Calendário demonstrativo: São Paulo UTC−03, segunda a sexta 08h–18h, sem feriados. Dia útil equivale a dez horas úteis; críticas funcionam 24/7. Essas convenções preenchem lacunas do PRD e ficam explícitas em `policies/tickets.ts`.
- Vencimento é `nextResponseDueAt < agora` em chamado não resolvido. Edição/encaminhamento do funcionário não reinicia prazo; mudança de prioridade recalcula a partir da referência de atendimento anterior. Resolução registra atualização humana; reabertura inicia novo prazo.
- Reabertura: status resolvido e resolução entre agora e sete dias atrás, incluindo o limite exato; condição revalidada na confirmação.
- Estados: open, waiting_human, resolved. Atualizar/encaminhar resolvido exige reabertura prévia.
- Números usam INC/REQ + UUID completo, evitando contador distribuído. Exemplos seed usam números próprios; mudança de tipo atualiza o prefixo do número.

## Duplicidade e resiliência

Busca lexical, sem embeddings: normaliza acentos/pontuação e compara palavras significativas dos títulos (Jaccard ≥ 0,6), dentro do mesmo tipo/categoria. Candidatos incluem resolvidos recentes para orientar reabertura; bloqueio de criação considera abertos. É uma heurística, não deduplicação semântica perfeita.

Todos os escritores do serviço atualizam um documento de controle por funcionário na transação. Isso serializa mutações daquele funcionário e impede duas confirmações diferentes de passarem simultaneamente pela busca de duplicados. Chamado existente compatível produz `DUPLICATE_TICKET`; consumidor consulta os candidatos e prepara atualização, sem mudar silenciosamente a operação confirmada. Conflitos de versão produzem `CONFLICT`.

`TICKET_SERVICE_UNAVAILABLE_UNTIL` simula indisponibilidade até uma data ISO no servidor. Não aceita chave de falha no cliente. Erros de rede/seleção/timeout Mongo são normalizados para `TEMPORARILY_UNAVAILABLE`. Não há retry de escrita com novo ID: preservar a mesma confirmação e consultar/repetir seu recibo. As transações do driver administram retries suportados; conflito de criação inicial do documento de controle pede repetir a mesma confirmação.

Erros de aplicação usam `AppError` e actions retornam `Result<T>`, incluindo VALIDATION, NOT_FOUND, FORBIDDEN, CONFLICT, DUPLICATE_TICKET, INVALID_CONFIRMATION, CONFIRMATION_EXPIRED, REOPEN_WINDOW_EXPIRED, INVALID_OPERATION e TEMPORARILY_UNAVAILABLE.

## Persistência e arquivos

Novas coleções: tickets, ticket_drafts, ticket_events, ticket_customer_locks e knowledge_articles. Banco/conexão existentes são reutilizados. Novos índices foram acrescentados ao script atual. Não houve migração destrutiva de conversas.

| Arquivos criados | Responsabilidade |
|---|---|
| `src/types/tickets.ts` | Entidades e DTOs com datas ISO |
| `src/server/schemas/tickets.ts` | Entradas Zod estritas |
| `src/server/policies/tickets.ts` | Prioridade, calendário, reabertura e similaridade |
| `src/server/services/{tickets,knowledge}.ts` | Autorização e casos de uso |
| `src/server/repositories/{tickets,knowledge,service-desk-seed}.ts` | Persistência e seed sem sobrescrita |
| `src/server/actions/{tickets,knowledge}.ts` | Entradas finas com Result |
| `src/server/lib/ticket-availability.ts` | Simulação e normalização de falhas transitórias |
| `src/server/data/service-desk-demo.ts` | Dois funcionários, seis artigos e seis chamados |
| `scripts/seed-service-desk.ts` | Seed administrativo seguro |
| `tests/tickets.test.ts`, `tests/helpers/ticket-memory.ts` | Testes locais com repository transacional de teste |
| `tests/tickets-database.ts` | Integração real e limpeza por namespace UUID |

Modificados: package.json (comandos), .env.example (opções), scripts/setup-database.ts (índices), README.md (caminhos/documentação). Sem alterações em componentes ou estilos.

## Central de ajuda e seed

`listKnowledgeArticles({search})` busca título, conteúdo e palavras-chave; sem pesquisa, lista até 50 artigos. `getKnowledgeArticle(id)` devolve conteúdo estruturado com categoria, condições de aplicabilidade e versão. Ambas exigem sessão. Busca é literal/regex escapada; não há RAG ou busca vetorial.

```sh
npm run db:seed
```

Por padrão, somente dry run. Para aplicar, definir NEXO_DEMO_PASSWORD no ambiente administrativo com pelo menos 12 caracteres e executar:

```sh
npm run db:seed -- --apply
```

Cria duas contas Firebase identificadas como demonstração, perfis e documentos com IDs estáveis. Contas existentes só são reconhecidas se UID/e-mail/claim nexoDemo/role coincidirem; nunca adota conta real nem altera senha/claims existentes. Registros usam `$setOnInsert`; reexecução preserva edições, datas e dados já existentes. Chamados/artigos/eventos são preparados em transação; Authentication e Mongo não compartilham uma transação, portanto uma falha externa pode exigir nova execução. Se atribuição inicial de claims falhar, remove apenas a conta criada naquela tentativa.

Seis artigos incluem VPN por Windows, expediente, acesso, equipamento, software e e-mail. Chamados cobrem dois donos, INC/REQ, prioridades variadas, abertos, vencidos e resolvido recente. A idade é calculada na primeira aplicação; reexecução não reposiciona datas, e o caso resolvido deixa naturalmente de ser recente com o tempo.

Não foi aplicado seed de contas/dados demonstrativos permanentes durante a implementação: senha depende do operador. O mecanismo de registros foi exercitado duas vezes em dados temporários no teste real, comprovando ausência de sobrescrita.

## Verificação e pendências

```sh
npm run typecheck
npm run lint
npm run test:backend
npm run test:tickets:database
npm run build
```

Na implementação passaram TypeScript, lint do código ativo, 19 testes locais (incluindo os cinco anteriores), integração real de chamados e build Next.js. A integração usa dois donos temporários, consulta o banco a partir de nova instância de serviço, testa concorrência, rollback, pesquisa de artigos e seed idempotente, e remove somente os registros do UUID da execução. O teste de banco não valida Firebase/login; esse fluxo permanece coberto pelos testes existentes da aplicação.

Tentativa de `db:setup` encontrou pendência IAM preexistente: falta `datastore.indexes.create`. O script parou antes dos índices novos. Conta administrativa precisa dessa permissão; depois executar `npm run db:setup`. Isso não impediu testes reais de leitura, escrita ou transações, mas índices continuam pendentes e consultas podem ter custo/latência maiores. Nenhuma permissão foi alterada automaticamente.

Sem Mastra, LLM, nova interface, pausa IA ou execução em stream nesta fase. A integração das actions aos fluxos visuais e o mecanismo de decisões do agente permanecem para a fase autorizada seguinte.
