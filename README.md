# Nexo Assist

No chat do funcionário, “Meus atendimentos” abre o histórico em um modal com título, última interação, status e prévia da mensagem. A lista carrega dez conversas por página e permite retomar o mesmo atendimento com IA ou analista; conversas encerradas permanecem disponíveis somente para consulta. A abertura do histórico não cria registros. Valide esse fluxo com `npm run test:history:ui` usando o servidor local e o Chrome.

O atendimento humano da [Fase 6](docs/fase-6-handoff-atendimento-humano.md) integra transferência, pausa da IA, resumo no console, atribuição, mensagens humanas, devolução à IA e encerramento seguro na conversa existente.

O serviço de chamados da Fase 2 está documentado em [docs/fase-2-servico-de-chamados.md](docs/fase-2-servico-de-chamados.md), incluindo confirmação, regras de prazo, operações, seed e verificações.

O núcleo de IA da Fase 3 usa Mastra e OpenAI no servidor, com streaming no chat existente. Consulte [configuração, ferramentas e limites](docs/fase-3-agente-mastra.md). Defina `OPENAI_API_KEY` e, opcionalmente, `NEXO_AI_MODEL` no ambiente local. A [Fase 4](docs/fase-4-memoria-persistencia.md) mantém memória e histórico persistentes. A [Fase 5](docs/fase-5-fluxos-inteligentes.md) integra coleta, consulta/seleção, rascunho, confirmação explícita, atualização, reabertura e cancelamento ao chat.

O chat inicia diretamente pelo campo de mensagem: Enter envia e Shift + Enter insere uma quebra de linha. A primeira mensagem válida cria conversa, mensagem e execução em uma única transação; o título é um resumo determinístico de até dez palavras/80 caracteres, sem chamada adicional ao modelo. Abrir a tela ou selecionar “Novo atendimento” não cria registros. Reenvios de resultado incerto preservam os mesmos UUIDs para recuperar o resultado sem duplicar a conversa ou processar a mensagem novamente.

Atendimentos de TI com Next.js 16 App Router, Firebase Authentication e Firestore Enterprise com compatibilidade MongoDB. O domínio contém conversas, mensagens, chamados e eventos de atendimento, com agente Mastra no servidor e serviço de chamados simulado persistido. Integração com service desk externo fica para uma etapa posterior.

## Configuração

Requer Node.js 22.23 ou superior compatível, npm e uma service account com acesso ao projeto.

```sh
npm install
```

Copie `.env.example` para `.env.local`. A configuração local foi obtida do projeto `nexo-assist`, banco `nexo-assist-db`, região `nam5`. `.env.local` e `service-account.json` são ignorados pelo Git.

- `GOOGLE_APPLICATION_CREDENTIALS`: caminho do JSON administrativo, disponível somente no servidor.
- Alternativa para hospedagem: `FIREBASE_SERVICE_ACCOUNT_JSON` ou Application Default Credentials com identidade de serviço.
- `MONGODB_URI`: endpoint com UID e localização do banco, sem senha. A autenticação usa Google OAuth via callback OIDC do driver MongoDB oficial, com renovação de tokens.
- `MONGODB_DATABASE`: ID do banco.
- `FIREBASE_PROJECT_ID`: projeto do servidor.
- `NEXT_PUBLIC_FIREBASE_*`: configuração pública do aplicativo web Firebase. Nunca colocar a chave privada nessas variáveis.

O banco exige TLS, modo load balanced e `retryWrites=false`. O módulo de conexão aplica essas opções e reutiliza o pool por processo. A identidade da aplicação precisa de `roles/datastore.user`. Para preparar índices, a conta administrativa precisa também de `roles/datastore.indexAdmin` ou permissão equivalente. Em produção, separe a identidade administrativa da identidade da aplicação.

```sh
npm run db:setup
npm run dev
```

### Pendências verificadas na infraestrutura

O aplicativo web `Nexo Assist Web` foi registrado no projeto existente. Authentication precisa ser ativado no Firebase Console → Authentication → Começar, com E-mail/senha habilitado. A ativação programática via Identity Platform retornou `BILLING_NOT_ENABLED`; nenhum faturamento foi alterado.

A conexão e os testes de escrita e transação no banco real passaram. A criação de índices retornou falta de `datastore.indexes.create`. Após conceder a permissão à conta administrativa, execute `npm run db:setup` e acompanhe a disponibilidade dos índices no console. Consultas sem índices adequados podem exigir varreduras e ter custo e latência maiores.

`node scripts/discover-cloud.mjs` consulta os recursos e prepara `.env.local` quando ele não existe. `--configure` também registra um aplicativo web e tenta habilitar Authentication. O script preserva um `.env.local` existente e não imprime tokens ou chaves privadas.

## Contas e autorização

A TI cria os usuários no Firebase Authentication. Não há cadastro público nem endpoint de atribuição de role. Após criar a conta, atribua a claim em um terminal administrativo:

```sh
npm run auth:role -- FIREBASE_UID chat
npm run auth:role -- FIREBASE_UID agent
npm run auth:role -- FIREBASE_UID remove
```

O comando preserva outras claims e revoga sessões. O usuário deve entrar novamente após a alteração. Não copie o JSON administrativo para `public/`, para o navegador ou para o repositório. Em produção, prefira uma identidade de serviço com privilégio mínimo.

- `/`: login com e-mail e senha e recuperação pelo Firebase. Usuários autenticados vão para o ambiente de sua role.
- `/chat`: cliente inicia atendimentos, consulta seu histórico e envia mensagens.
- `/profile`: dados da própria conta e solicitação de redefinição de senha.
- `/agent`: todos os atendentes acompanham todas as conversas. Somente o responsável atual responde, devolve à fila ou encerra. A atribuição é atômica.
- Contas sem role válida são recusadas. Clientes não acessam agent; atendentes não acessam chat ou profile.

A sessão usa cookie HttpOnly, SameSite=Lax e Secure em produção. “Manter conectado” cria uma sessão de cinco dias; sem a opção, o cookie é de sessão e a credencial expira em oito horas. O SDK cliente usa apenas memória, sem persistir tokens em localStorage ou IndexedDB. Login exige autenticação recente. Cada operação valida sessão, revogação e claims atuais.

Logout revoga as sessões Firebase do usuário em todos os dispositivos e remove o cookie local. Se o provedor estiver indisponível, o cookie local ainda é removido. Mudanças de role invalidam o acesso da sessão antiga e exigem novo login.

As ações usam a proteção de origem e Host do Next.js. Mantenha a configuração de proxy e Host correta na hospedagem e use HTTPS em produção. Google fica para a etapa de integração de identidade corporativa.

## Dados e arquitetura

- `src/server/actions`: Server Actions de autenticação e mutações, com resultados padronizados.
- `src/auth`: sessão, guards e políticas de acesso.
- `src/server/services`: validação Zod e regras de negócio.
- `src/server/repositories`: consultas e persistência transacional.
- `src/server/schemas`, `src/lib/schemas` e `src/types`: entradas e contratos.
- `src/server/lib`: integrações privilegiadas, conexão e tratamento de erros.

Coleções: `users`, `conversations`, `messages` e `conversation_events`. As roles são autoritativas no Firebase, não no perfil salvo no banco. Datas são BSON Date e chegam à interface como ISO. Mensagens são documentos separados do atendimento.

Estados: `waiting` → `active` → `closed`; `active` → `waiting` devolve à fila. Encerramentos preservam mensagens. A versão do documento impede conflitos de atribuição; transações mantêm mensagem ou evento e conversa consistentes. UUIDs permitem repetir requisições sem duplicar mensagens ou atendimentos. A autorização sempre verifica o recurso existente.

Leituras iniciais acontecem em Server Components; filtros e paginação usam a URL e consultas no servidor. Listas têm até 20 itens por página; históricos, 50 mensagens. A interface atualiza a cada dez segundos enquanto a aba está visível e exibe mensagens recentes. A busca literal por assunto e nome pode exigir varreduras. Presença, contagem de não lidas e respostas de IA não são simuladas.

## Memória e persistência do agente

Consulte [Fase 4 — Conversas, memória e persistência](docs/fase-4-memoria-persistencia.md) para os contratos, recuperação de interrupções, interpretação do limite de 30 mensagens e testes.

## Validação

```sh
npm run typecheck
npm run lint
npm run build
npm run test:backend
npm run test:database
```

`test:backend` verifica isolamento, políticas de resposta e encerramento e limites de entrada. `test:database` utiliza o banco configurado, cria registros temporários com UUID próprio, verifica persistência, idempotência, concorrência e transações, e remove os registros do teste.

Com o servidor em execução na porta 3000 e Chrome instalado:

```sh
npm run test:ui
npm run test:integration
```

`test:ui` verifica rotas anônimas, cookie forjado, ausência de credenciais preenchidas, recuperação e layout do login. `test:integration` exige Authentication ativo e acesso administrativo: cria contas temporárias e testa login, isolamento entre clientes, acesso cruzado entre roles, mensagens persistidas, observação por outro atendente, encerramento, claims alteradas e logout. Remove contas e dados ao terminar. Use `TEST_BASE_URL` para outro endereço local.

A verificação completa de autenticação depende da ativação externa de Authentication. O lint apresenta dois avisos preexistentes nos scripts históricos de `artifacts/`.

## Restauração visual

Os componentes de apresentação foram recuperados do commit `74ee161` e adaptados aos atendimentos persistidos. A autenticação, os guards e a camada de dados permanecem separados da interface.

Após gerar o build, execute `node tests/visual-restoration.mjs` para comparar login, perfil, chat e console do atendente em 390, 768 e 1440 px. O teste renderiza as versões do Git e as versões restauradas em um ambiente isolado com dados de apresentação, sem criar rotas de acesso alternativo à aplicação. As capturas e medidas ficam em `artifacts/visual-restoration/`. A largura móvel do console segue as capturas históricas, corrigindo o conflito entre as classes de grade legadas no Tailwind atual.

Nesta restauração, também passaram os testes completos com Firebase e Firestore reais, incluindo login, claims, isolamento entre clientes, mensagens, atribuição, encerramento e logout. Contas e registros temporários são removidos ao final.
