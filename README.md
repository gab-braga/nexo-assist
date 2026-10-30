# Nexo Assist

Assistente de service desk de TI: o funcionário conversa para consultar a central de ajuda, encontrar seus chamados, preparar aberturas, complementar ou reabrir chamados e pedir atendimento humano. O analista recebe o contexto, assume, responde e devolve à IA ou encerra. Ações verificáveis aparecem acima das respostas e permanecem no histórico.

O serviço de chamados é **simulado e persistido**, separado do agente; não integra um legado externo. Firebase Authentication e Firestore Enterprise são reais. As suítes comuns usam um provedor de modelo simulado para evitar chamadas pagas.

## Execução local

Ambiente validado: Node.js **22.23.1**, npm **12.0.2** e Chrome para os testes de navegador. `.nvmrc` registra o Node utilizado. Use um projeto Firebase de desenvolvimento/demonstração; não execute seed ou testes em produção.

```sh
npm ci
```

Se o PowerShell bloquear `npm.ps1`, use `npm.cmd` nos mesmos comandos, sem alterar a política de execução. Copie `.env.example` para `.env.local`:

| Variável | Responsabilidade |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Projeto do servidor |
| `GOOGLE_APPLICATION_CREDENTIALS` | Caminho local do JSON administrativo, fora do Git e de `public/` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Alternativa server-only para hospedagem, JSON em uma linha |
| `MONGODB_URI`, `MONGODB_DATABASE` | Endpoint/ID do Firestore Enterprise com API MongoDB |
| `NEXT_PUBLIC_FIREBASE_*` | Configuração pública do aplicativo web, definida antes do build |
| `OPENAI_API_KEY` | Credencial do modelo, somente no servidor |
| `NEXO_AI_MODEL` | Modelo OpenAI configurável; padrão: `gpt-5.4-mini` |
| `NEXO_DEMO_PASSWORD` | Senha local das contas fictícias, mínimo de 12 caracteres |
| `TICKET_SERVICE_UNAVAILABLE_UNTIL` | Opcional: instante ISO futuro para simular indisponibilidade |

Não envie chaves pelo chat nem as coloque em variáveis `NEXT_PUBLIC_`. `.env.local` e `service-account.json` são ignorados pelo Git. Sem arquivo/JSON explícito, o servidor aceita Application Default Credentials. O navegador não acessa o banco diretamente.

No Firebase Console, habilite Authentication com E-mail/senha, registre o aplicativo web e autorize o domínio local. O banco precisa ser **Firestore Enterprise com API MongoDB**, não Firestore Standard. A conexão usa TLS, `loadBalanced=true`, `retryWrites=false`, `authSource=$external` e OAuth/OIDC com renovação de tokens.

A identidade de execução precisa de acesso ao Firestore (`roles/datastore.user`) e às operações de Authentication usadas para verificar usuários/sessões, criar sessão e revogar sessões. A identidade administrativa de preparação precisa também criar índices e gerenciar contas fictícias. Separe essas identidades na hospedagem.

```sh
npm run db:setup
npm run db:seed
# O comando anterior é dry run: não grava nada.
# Defina NEXO_DEMO_PASSWORD em .env.local; aplique somente em ambiente de demo:
npm run db:seed -- --apply
npm run dev
```

Abra `http://localhost:3000`. Não existe cadastro público. O seed prepara:

| Conta fictícia | Role | Destino |
| --- | --- | --- |
| `ana@nexo-demo.example.test` | Funcionária | `/chat` |
| `bruno@nexo-demo.example.test` | Funcionário | `/chat` |
| `carla@nexo-demo.example.test` | Analista | `/agent` |

Use a senha definida em `NEXO_DEMO_PASSWORD`; não há senha padrão ou senha livre. Reexecuções preservam senhas, claims e documentos. O seed recusa colisões de identidade/proprietário e não adota contas existentes pelo e-mail. São seis artigos, seis chamados variados e quatro conversas fictícias nos estados IA/fila/humano/encerrado. Datas são relativas à **primeira** aplicação; repetir o seed não renova chamados nem reabre atendimentos utilizados.

Para contas criadas manualmente no Firebase, atribua a claim em terminal administrativo:

```sh
npm run auth:role -- FIREBASE_UID chat
npm run auth:role -- FIREBASE_UID agent
npm run auth:role -- FIREBASE_UID remove
```

O comando preserva outras claims e revoga sessões; entre novamente após mudar a role. O auxiliar histórico `scripts/discover-cloud.mjs` não é necessário para executar; `--configure` altera recursos externos e não deve ser usado sem essa intenção.

## Tecnologias e arquitetura

Next.js 16.4.3 App Router, React 19, TypeScript strict, Tailwind CSS, shadcn/ui, Lucide, Zod, Firebase Authentication, Firestore Enterprise/MongoDB, Mastra 1.80.0 e SDK OpenAI. O `package-lock.json` fixa a instalação.

```text
src/app/                      páginas Server Components, layouts e POST /api/agent
src/components/conversation/ chat, console, histórico, rascunhos e ações
src/auth/                     sessão, guards, acesso e estados operacionais
src/server/actions/           adaptadores autenticados para a interface
src/server/services/          casos de uso, validação e confirmação
src/server/repositories/      consultas, transações, versões e recibos
src/server/policies/          prioridade, calendário, busca e projeção segura
src/server/ai/                Mastra, ferramentas, contexto, memória e streaming
src/server/lib/               Firebase Admin, pool MongoDB e erros
src/server/data/              fixtures fictícias reproduzíveis
src/server/schemas/           entradas do servidor
src/lib/schemas/, src/types/  contratos públicos e tipos
tests/, scripts/              testes e preparação administrativa
```

Fluxo: formulário → Route Handler autenticado → criação/reserva transacional de conversa, mensagem e execução → memória autorizada → Mastra → ferramentas → serviços determinísticos → repositories. Resposta e ações usam a mesma conexão NDJSON. Server Components recuperam o histórico; Client Components cuidam das interações. Server Actions transportam confirmação e atendimento humano.

Coleções: `users`, `conversations`, `messages`, `conversation_events`, `tickets`, `ticket_events`, `ticket_drafts`, `ticket_customer_locks`, `knowledge_articles` e `agent_runs`. O estado operacional deriva dos campos existentes: `AGENT_ACTIVE`, `WAITING_FOR_ANALYST`, `ANALYST_ACTIVE`, `CLOSED`. Versões e transações protegem atribuição, mensagens, propostas e operações. O banco é a fonte persistente do histórico.

## Decisões do agente e proteções

Mastra atende à preferência do desafio e oferece ferramentas tipadas, etapas, cancelamento e streaming sem servidor adicional. OpenAI é o provedor único já integrado; o SDK suporta ferramentas e respostas em streaming. O modelo é configurável para equilibrar qualidade, latência e custo. Esta entrega não apresenta comparação de preços ou benchmark entre provedores.

O modelo interpreta intenção e propõe tipo, categoria, impacto e urgência. Deve perguntar o que falta e consultar fontes reais. Ferramentas não recebem identidade do cliente/modelo: o contexto confiável liga funcionário, conversa e execução e verifica autenticação, controle humano e limites. Artigos, histórico e descrições são dados, nunca instruções privilegiadas.

Permanecem determinísticos: autorização, campos obrigatórios, prioridade, calendário, reabertura, candidatos, verificação final de duplicidade, confirmação, escrita, idempotência e transições. O modelo não possui ferramenta para confirmar operações. O funcionário revisa o card e clica **Confirmar operação**; “sim” em texto livre não escreve. A confirmação vincula dono, conversa, rascunho, digest e controle. Resultado e recibo são atômicos; replay recupera o resultado.

A busca de artigos usa palavras, normalização de acentos e um pequeno vocabulário explícito de termos relacionados, sem busca vetorial. Retorna somente artigos existentes. Procedimentos restritos a Windows 10 são omitidos para Windows 11 ou ambiente desconhecido, sem inventar instruções.

A memória usa mensagem inicial, janela recente e referências autorizadas de chamado, rascunho, coleta e resumo humano, com orçamento de 16 mil caracteres. Não duplica mensagens no storage Mastra. Novo envio invalida uma proposta anterior não aplicada; dados coletados podem preparar uma revisão, mas a confirmação antiga não é reutilizada.

Limites por execução: seis etapas, oito ferramentas, 2.048 tokens de saída e 60 segundos. São até 30 mensagens aceitas pela IA por conversa; replay não conta novamente e mensagens humanas não consomem o limite. O título vem da primeira mensagem sem outra chamada ao modelo. Abrir novo atendimento não cria documentos.

## Regras de negócio

`INC` representa falha; `REQ`, pedido de acesso, equipamento ou software. Categorias: Acesso, Rede e VPN, Hardware, Software, E-mail e Outros. O afetado vem da autenticação.

| Prioridade | Condição considerada | SLA de resposta/atualização |
| --- | --- | --- |
| Crítica | Equipe/empresa impedida | 1 hora corrida, 24/7 |
| Alta | Pessoa impedida ou compromisso no mesmo dia | 4 horas úteis |
| Média | Existe alternativa | 3 dias úteis |
| Baixa | Sem urgência | 5 dias úteis |

Calendário: segunda a sexta, **08h–18h de São Paulo (UTC−03)**, sem feriados; dia útil de dez horas. O cálculo preserva minutos/milissegundos e atravessa fins de semana. SLA não é promessa de resolução. Abertura/reabertura iniciam prazo. A resposta humana ligada ao chamado selecionado registra atualização do serviço, prazo e histórico com a mensagem. Complementos do funcionário não adiam o SLA; mudança de prioridade recalcula desde a última resposta do serviço. Resolvidos não ficam vencidos.

Duplicidade compara dono, tipo, categoria e título normalizado; chamado aberto não deve gerar outra abertura. A checagem final acontece sob lock do funcionário. É uma heurística lexical, sem garantia semântica para todo enunciado. Reabertura exige resolução há no máximo sete dias corridos, inclusive a fronteira, revalidada na confirmação.

Handoff ocorre por solicitação, criticidade, vencimento ou incerteza. A IA pausa, sua execução é invalidada e a fila recebe contexto. Somente o analista atribuído responde, devolve ou encerra; analistas autorizados consultam o console. Ao devolver, a IA aguarda nova mensagem e recupera o contexto humano. Encerrar conversa não resolve automaticamente chamado.

## Transparência, segurança e falhas

Respostas com autoria `nexo-assist` e role `assistant` renderizam Markdown no chat e no console com `react-markdown` e `remark-gfm`, inclusive durante streaming e após recuperar o histórico. O conteúdo original continua no banco. Mensagens do funcionário, do analista e avisos de sistema permanecem como texto simples. Tabelas/código usam rolagem interna e cores do tema, sem HTML bruto ou carregamento de imagens externas. Valide com `npm run test:markdown` e, com servidor local na porta 3100, `npm run test:markdown:ui`.

`agent_runs.audit` registra início/resultado de ferramentas, UUID, sequência, duração e fatos limitados. Ações aparecem acima da resposta e têm detalhes expansíveis; o console acrescenta métricas permitidas. Interpretações do modelo, regras e resultados têm origens distintas. Confirmação e handoff vêm dos recibos existentes. Não há justificativa posterior gerada por LLM nem exposição de chain-of-thought.

Falha ao registrar o início impede a ferramenta. Resultado não confirmável aparece como **desconhecido**, nunca sucesso presumido. Quedas/expiração preservam histórico e não repetem escritas automaticamente. Reenvios incertos mantêm IDs para consultar o mesmo resultado. Falha de leitura da auditoria preserva mensagens com aviso.

Sessão: cookie HttpOnly, SameSite=Lax, Secure em produção, revogação e claims atuais verificadas no servidor. “Manter conectado” dura cinco dias; sem a opção, cookie de sessão com credencial de oito horas. O SDK cliente guarda autenticação em memória, sem token em localStorage. Funcionários acessam somente seus recursos. Server Actions têm proteção de origem do Next; a rota do agente exige Origin correspondente, JSON e corpo de até 20 KB.

Logs omitem corpos de erros e saídas sensíveis. Auditoria usa campos permitidos e redação de padrões de segredo. O conteúdo da conversa é enviado ao provedor para responder: não insira segredos nas mensagens. Isso não substitui política organizacional de privacidade/retenção.

## Testes e qualidade

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run test:database:all
npm run build
npm run start -- -p 3100
# Em outro terminal, mantendo esse servidor:
npm run test:e2e
```

O E2E usa `http://localhost:3100`; configure `TEST_BASE_URL` para outra instância local. Exige Chrome, Authentication ativo e permissões administrativas de teste. Banco/E2E criam namespaces UUID e contas temporárias, removidos ao finalizar; não aplicam o seed permanente.

`test:unit` cobre regras, ferramentas, memória, permissões, confirmação, falhas, transparência e ciclos de imports. Sete suítes de banco verificam transações, concorrência, recuperação em processo separado e seed idempotente. E2E valida login real, chat, consulta/atualização, handoff, histórico e progresso incremental com **LLM simulado**, preservando Firebase, banco, serviços e renderização reais. O runner retorna erro se qualquer suíte falhar.

Teste pago separado e explícito: `npm run test:agent:live`. Não integra as suítes comuns e não foi executado nesta fase. Decisões de um modelo real continuam probabilísticas. O lint mantém dois avisos históricos em `artifacts/`, sem erros na aplicação.

## Demonstração, deploy e limitações

Consulte o [roteiro de 5–10 minutos](docs/demo.md), os [passos para deploy futuro](docs/deploy.md) e o [relatório de conformidade](docs/final-report.md). **Nenhum deploy foi realizado nesta fase.** É necessário runtime Node, saída de rede para Firebase/Firestore/OpenAI e streaming; exportação estática ou Edge não substituem esse servidor.

Limitações conhecidas:

- Busca e duplicidade lexicais, com resultados limitados; sem avaliação do modelo real ou garantia semântica universal nesta fase.
- Calendário sem feriados; seed envelhece; o limite de 30 conta mensagens aceitas pela IA na conversa persistida.
- Contexto/páginas limitados; buscas podem exigir varreduras. Índices da futura hospedagem precisam de conferência administrativa.
- Sem isolamento por equipe entre analistas, legado externo, retenção automática ou exportador de traces configurado. Correlação/métricas não significam coletor externo habilitado.
- Antes de exposição pública: limitar tráfego/custo por usuário e proxy, definir orçamento do provedor e verificar timeout/streaming da plataforma. Limite por conversa não substitui proteção global contra abuso.

Com mais tempo: avaliação rotulada com modelo real, busca/ranking ampliados, calendário corporativo, limites globais, retenção e monitoramento com privacidade.

Histórico técnico: [Fase 2](docs/fase-2-servico-de-chamados.md), [Fase 3](docs/fase-3-agente-mastra.md), [Fase 4](docs/fase-4-memoria-persistencia.md), [Fase 5](docs/fase-5-fluxos-inteligentes.md), [Fase 6](docs/fase-6-handoff-atendimento-humano.md), [Fase 7](docs/fase-7-transparencia-observabilidade.md).
