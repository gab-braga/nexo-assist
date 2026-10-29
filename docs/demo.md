# Demonstração — 5 a 10 minutos

## Preparação

Use um projeto exclusivo de demonstração, conforme o README. Configure Firebase, banco, OpenAI e uma senha local com pelo menos 12 caracteres; execute `db:setup`, o dry run de `db:seed` e, nesse ambiente, `db:seed -- --apply`. Não existe senha padrão. O seed contém Ana, Bruno, Carla, seis artigos, seis chamados e quatro conversas fictícias. O reaproveitamento dos IDs não renova dados em reexecuções.

Abra duas sessões independentes do navegador: funcionária `ana@nexo-demo.example.test` e analista `carla@nexo-demo.example.test`, com a senha escolhida no ambiente. Use uma janela privada para uma das contas, pois logout revoga todas as sessões da mesma conta. Não mostre `.env.local`, tokens ou o JSON administrativo durante a gravação.

Para apresentar sem dependência de quota/latência do provedor, existe uma alternativa automatizada e controlada: execute `npm run test:e2e` contra uma instância local na porta 3100. Os testes usam o agente Mastra, ferramentas e banco reais com modelo simulado; isso é uma demonstração dos contratos e fluxos, não da compreensão de um LLM real. Não há modo falso na aplicação de produção.

## Sequência principal

| Tempo | Ação | O que comprovar / alternativa |
| --- | --- | --- |
| 0:00–0:45 | Entrar como Ana e abrir “Novo atendimento” | Campo de mensagem vazio, sem título obrigatório e sem registro criado antes do envio |
| 0:45–2:00 | Enviar “Estou com erro 809 na VPN. Uso Windows 10. Como posso resolver?” | Consulta real ao artigo **VPN com erro 809**, ações acima da resposta e condição Windows 10. Expandir os detalhes; não prometer que a redação será idêntica |
| 2:00–2:30 | Informar “Agora confirmei que meu computador usa Windows 11” | Procedimento exclusivo do Windows 10 não pode ser recomendado; o artigo orienta abrir chamado. Se faltar ambiente, responder à pergunta antes de prosseguir |
| 2:30–4:30 | Em novo atendimento, pedir “Meu teclado USB de demonstração não funciona. Só eu sou afetada, não tenho alternativa e não consigo trabalhar. Quero registrar o problema” | Completar os campos que faltarem, conferir INC/Hardware, prioridade alta e quatro horas úteis. Antes do botão, existe apenas rascunho |
| 4:30–5:15 | Clicar **Confirmar operação** e consultar “Como está o chamado do meu teclado?” | Número real, card persistido e consulta vinculada ao funcionário. Recarregar a página e recuperar o mesmo resultado |
| 5:15–5:45 | Pedir “Acrescente que o problema começou após a atualização” | Revisar e confirmar a atualização. Descrição anterior permanece no histórico; edição do funcionário não renova o SLA |
| 5:45–6:15 | Pedir “Quero falar com um analista” ou usar **Atendimento humano** | Conversa entra na fila, IA pausa, resumo e ações ficam disponíveis |
| 6:15–7:15 | No console da Carla, abrir essa conversa e clicar **Assumir atendimento** | Ver resumo, chamado e detalhes do agente. Enviar “Vou verificar o dispositivo; você pode testar outra porta USB?” |
| 7:15–8:00 | Responder como Ana “Já testei outra porta e o problema continua” | Mensagens humanas persistem sem acionar Mastra. Resposta do analista atualiza o prazo do chamado selecionado atomicamente |
| 8:00–9:00 | Carla clica **Devolver à IA**; Ana envia “O que falta para continuar?” | IA aguarda essa nova mensagem e recebe o contexto humano. Mostrar ações e abrir **Meus atendimentos** para retomar a mesma conversa |
| 9:00–10:00 | Mostrar o atendimento fictício encerrado do Bruno ou encerrar uma conversa separada | Histórico consultável, campo de envio bloqueado e chamado não resolvido automaticamente |

## Alternativas previsíveis

- O seed da Ana contém uma VPN aberta. Consultar/abrir outro caso de VPN pode gerar seleção de duplicado ou encaminhamento por prazo vencido. Isso é comportamento esperado: mostrar o chamado existente, sem forçar outra abertura. Por isso o roteiro usa teclado como novo problema.
- Se já existir chamado de teclado de uma apresentação anterior, use-o para demonstrar seleção/atualização ou escolha outro problema fictício com fatos diferentes; não altere só o título para contornar a duplicidade.
- Caso o modelo pergunte tipo, categoria, impacto ou urgência, use as opções rápidas ou responda apenas o dado faltante. Não trate a pergunta como falha nem invente um resultado para acelerar a demo.
- Se o provedor falhar, mostrar o erro, o texto preservado e o histórico; consultar o mesmo resultado antes de reenviar. Usar o conjunto automatizado com LLM simulado como alternativa, declarando a diferença.
- Para demonstrar vencimento/reabertura, use os chamados fictícios do seed: há casos abertos antigos, resolvido há quatro dias e resolvido antigo. O tempo é relativo à primeira execução; em um ambiente envelhecido, crie um projeto de demo novo ou mostre as verificações automatizadas de fronteira.
- Não é necessário rodar todos os cenários na apresentação. Os testes cobrem concorrência, confirmação duplicada, falha de persistência e transferência em execução sem depender de uma resposta aleatória do LLM.

## Critérios para encerrar a apresentação

Mostrar ao menos uma consulta fundamentada, ação expandida, rascunho antes da escrita, recibo depois da confirmação, recuperação após recarga e troca humano/IA. Explicar as limitações de busca lexical, calendário sem feriados e avaliação com modelo simulado nesta fase.
