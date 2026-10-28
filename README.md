# Nexo Assist

Interfaces do service desk implementadas em Next.js App Router, Tailwind CSS e componentes Shadcn/ui com Radix. Ícones Lucide React.

## Executar

```sh
npm install
npm run dev
```

- `/`: identificação e recuperação simulada de senha.
- `/profile`: dados do cliente e redefinição simulada.
- `/chat`: criação de chamado, edição, confirmação, consulta e transferência. As ações de troca de fluxo aparecem no topo ao passar o cursor; também é possível digitar “status” no campo de mensagem.
- `/agent`: conversas, pesquisa, filtros, chamados, assumir atendimento, responder, devolver ao assistente e encerrar.

Todos os dados são locais, centralizados em `src/data/data.ts`. Os estados são mantidos em memória e reiniciam ao recarregar. Nenhuma mensagem ou e-mail é enviado a serviços externos. Fontes locais e suas licenças estão em `src/lib/fonts`, configuradas exclusivamente em `src/lib/font.ts`.

## Verificações

```sh
npm run typecheck
npm run lint
npm run build
npm run test:ui
```

O teste de interface requer o servidor local na porta 3000 e utiliza o Chrome instalado no caminho padrão do Windows. Ele verifica os principais fluxos e gera capturas desktop e mobile em `artifacts/`.

As seis referências foram organizadas em quatro páginas, com os estados de criação/consulta e espera/chat compartilhando suas respectivas interfaces. O logotipo é uma aproximação tipográfica e as fontes são equivalentes visuais; os arquivos originais da identidade não foram fornecidos. Os layouts móveis são adaptações das referências desktop.
