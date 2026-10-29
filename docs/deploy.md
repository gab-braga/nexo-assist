# Viabilidade de deploy — sem publicação nesta fase

A aplicação foi validada com `next build` e `next start` local. Não foram criados serviços de hospedagem, domínios, índices, políticas IAM ou publicações externas nesta fase. O deploy é diferencial opcional do PRD e depende de autorização posterior.

## Compatibilidade

É necessário um servidor **Node.js**, compatível com a versão validada no `.nvmrc`, executando Next.js App Router, Firebase Admin, MongoDB/OIDC e Mastra. O projeto não é uma exportação estática e a rota de IA declara `runtime = "nodejs"`. Um processo Node ou container é uma opção tecnicamente compatível; uma plataforma serverless precisa ser verificada quanto a duração, streaming e conectividade antes da escolha. Não se presume compatibilidade de um plano específico de hospedagem.

`POST /api/agent` usa NDJSON e `no-store`, com `X-Accel-Buffering: no`. A plataforma e qualquer proxy devem transmitir chunks imediatamente, sem buffering. A execução do agente tem limite interno de 60 segundos; a rota declara `maxDuration = 70`. Preparação, autenticação e persistência também consomem tempo: medir margem real e ajustar os limites antes de publicar, conforme a plataforma. Não basta o provedor permitir uma requisição longa se o proxy a encerrar antes.

O banco e as sessões sobrevivem à troca de processo; memória do modelo não depende de disco local. O pool MongoDB é reutilizado por processo. Escala horizontal continua usando versões, locks e transações no banco, não locks locais. O build e os assets precisam corresponder à mesma versão da aplicação; em múltiplas instâncias, revisar as orientações de chaves de Server Actions e consistência de builds da documentação instalada do Next.js.

## Passos após autorização

1. Escolher projeto Firebase/Firestore de demonstração e identidade de execução com privilégio mínimo. Separar credenciais de preparação (índices/seed/contas) das de execução. Não reutilizar dados de produção.
2. Preparar secrets do servidor: Firebase Admin/ADC, projeto, MongoDB, chave OpenAI e modelo. O JSON administrativo fica em secret manager/arquivo privado ou variável server-only; nunca na imagem pública, no Git ou em `public/`.
3. Configurar `NEXT_PUBLIC_FIREBASE_*` **antes de gerar o build**, pois essas variáveis são incorporadas ao código do cliente. Conferir domínio autorizado em Authentication, E-mail/senha e links de recuperação.
4. Com identidade administrativa, preparar índices usando `npm run db:setup` e verificar que estão disponíveis. O código desse comando grava índices; ele não foi executado nesta fase, conforme a restrição de não alterar infraestrutura.
5. Em uma instalação nova do ambiente de demo, rodar o seed em dry run, escolher senha forte local e só então aplicar explicitamente. Não expor senhas de demonstração junto às chaves administrativas. Limitar quem recebe essas contas.
6. Instalar com `npm ci`, executar verificações, gerar `npm run build` e iniciar `npm run start` com a porta indicada pelo serviço. Configurar HTTPS e conferir que o cookie de sessão fica Secure/HttpOnly/SameSite=Lax.
7. Permitir saída TLS para Firebase/Google, endpoint Firestore Enterprise na porta 443 e OpenAI. Testar renovação OIDC e concorrência com as credenciais da identidade hospedada.
8. Configurar proxy com Host/Origin corretos, limite de corpo, tempo de requisição e streaming sem buffer. A verificação de origem da aplicação não deve ser removida para contornar erro de proxy.
9. Antes de acesso externo, aplicar limites de tráfego por usuário/IP e orçamento/quota do modelo. O projeto limita ferramentas/tokens/tempo/mensagens por conversa, mas ainda não impõe limite global de criação de conversas ou custo diário.
10. Validar login, confirmação, replay, interrupção, handoff, recuperação e autorização na URL hospedada com dados fictícios, e confirmar remoção das contas temporárias. Testes comuns simulam o provedor; teste real pago é comando separado e explícito.

## Logs, monitoramento e segurança operacional

- Preservar logs sanitizados de código/UUID/duração; não habilitar captura irrestrita de prompts, entradas de ferramentas ou corpos de erros.
- A auditoria funcional está em `agent_runs.audit` e eventos de negócio. Não há exportador externo de traces do Mastra configurado. Caso seja adicionado posteriormente, revisar redação, retenção e acesso antes de enviar conteúdo a terceiros.
- Acompanhar falhas do provedor, execuções interrompidas, indisponibilidade do banco, custo por conversa e tempo até o primeiro chunk. Medição de carga e p95 não foi realizada nesta fase.
- Definir retenção/exclusão de conversas, backup e acesso administrativo. O projeto não tem política automática de retenção nem segregação de analistas por equipe.
- O Google Fonts usado no build exige acesso de rede durante a compilação. Planejar o ambiente de build, sem copiar credenciais para assets ou logs.

## Evidências e limites

O guia de referência usado para Next.js é o instalado em `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`, compatível com a versão do projeto. Build/servidor local e integrações foram exercitados; políticas IAM, índices de hospedagem, orçamento, domínio, latência externa e comportamento de uma plataforma pública permanecem verificações posteriores. Nenhuma disponibilidade pública é declarada nesta entrega.
