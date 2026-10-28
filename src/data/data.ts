import { Conversation } from "@/interfaces/conversation";
import { Ticket } from "@/interfaces/ticket";

export const user = {
  name: "Ana Souza",
  email: "ana.souza@nexo.com.br",
  initials: "AS",
  department: "Financeiro",
};

export const tickets: Ticket[] = [
  {
    id: "INC-20311",
    title: "Notebook lento após atualização",
    status: "Aguardando analista",
    color: "amber",
    date: "16 out",
    description:
      "Lentidão geral desde a atualização de 15/10. Reiniciar e rodar o diagnóstico da central não resolveu.",
    category: "Hardware › Notebook",
    priority: "Média",
  },
  {
    id: "INC-20298",
    title: "Acesso à pasta Financeiro no SharePoint",
    status: "Em andamento",
    color: "blue",
    date: "14 out",
    description: "Solicitação de acesso à pasta compartilhada do Financeiro.",
    category: "Acessos › SharePoint",
    priority: "Média",
  },
  {
    id: "REQ-10442",
    title: "Segundo monitor para home office",
    status: "Aprovado",
    color: "green",
    date: "09 out",
    description: "Solicitação de um segundo monitor para o trabalho remoto.",
    category: "Equipamentos",
    priority: "Baixa",
  },
  {
    id: "INC-19877",
    title: "Outlook não sincroniza no celular",
    status: "Resolvido em 02 set",
    color: "gray",
    date: "02 set",
    description: "Sincronização de e-mail restabelecida.",
    category: "E-mail",
    priority: "Baixa",
  },
  {
    id: "INC-19410",
    title: "Troca de senha da rede",
    status: "Resolvido em 11 jul",
    color: "gray",
    date: "11 jul",
    description: "Senha da rede atualizada.",
    category: "Acessos",
    priority: "Baixa",
  },
];

export const draft = {
  id: "D-381",
  title: "VPN não conecta no notebook — erro 809",
  description:
    "Desde 20/10 o notebook (Windows 11) não conecta na VPN e mostra o erro 809. Precisa dela para a reunião das 14h.",
  category: "Rede e VPN",
};

export const impactOptions = [
  "Só eu",
  "Minha equipe",
  "Toda a empresa",
  "Não sei",
];

export const conversations: Conversation[] = [
  {
    name: "Ana Souza",
    initials: "AS",
    preview: "Está parado há 5 dias. Quero falar com...",
    status: "Transferida · INC-20311",
    time: "10:05",
    tone: "blue",
    color: "red",
    unread: 2,
  },
  {
    name: "Carla Mendes",
    initials: "CM",
    preview: "Preciso de acesso ao SAP ainda hoje",
    status: "Transferida · contato em 25 min",
    time: "09:58",
    tone: "orange",
    color: "red",
    unread: 1,
  },
  {
    name: "Bruno Tavares",
    initials: "BT",
    preview: "Nexo: Vou chamar um analista para isso.",
    status: "Agent pediu ajuda · confiança 41%",
    time: "09:51",
    tone: "purple",
    color: "amber",
  },
  {
    name: "Diego Ramos",
    initials: "DR",
    preview: "digitando...",
    status: "Agent atendendo",
    time: "agora",
    tone: "green",
    color: "green",
  },
  {
    name: "Elisa Prado",
    initials: "EP",
    preview: "Nexo: Chamado INC-20519 criado.",
    status: "Agent atendendo",
    time: "10:03",
    tone: "pink",
    color: "green",
  },
  {
    name: "Fábio Nunes",
    initials: "FN",
    preview: "Isso resolveu, obrigado!",
    status: "Resolvida pelo agent",
    time: "10:01",
    tone: "gray",
    color: "gray",
  },
  {
    name: "Gabriela Rocha",
    initials: "GR",
    preview: "Nexo: A senha do Wi-Fi foi enviada...",
    status: "Resolvida pelo agent",
    time: "ontem",
    tone: "yellow",
    color: "gray",
  },
];

export const agentMessages = [
  { text: "Qual o status do meu chamado?", time: "10:01", from: "user" },
  {
    text: "Você tem 3 chamados abertos. Sobre qual deles quer saber?",
    time: "10:01",
    from: "ai",
  },
  {
    text: "INC-20311 · Notebook lento após atualização",
    time: "10:02",
    from: "user",
  },
  {
    text: "Está sem atualização há 5 dias, acima do prazo de 3 dias úteis. Quer que eu chame um analista?",
    time: "10:02",
    from: "ai",
  },
  { text: "Está parado há 5 dias.", time: "10:04", from: "user" },
  { text: "Quero falar com um analista.", time: "10:04", from: "user" },
  {
    text: "Encaminhei para o Suporte N2. Um analista vai falar com você em até 2 h úteis.",
    time: "10:05",
    from: "ai",
  },
];

export const takeoverMessages = [
  {
    text: "Oi, Ana! Aqui é o Rafael. Já li o histórico e vou verificar o driver de vídeo remotamente. Pode deixar o notebook ligado agora?",
    time: "10:12",
    from: "agent",
  },
  { text: "Posso sim, está ligado.", time: "10:13", from: "user" },
];

export const suggestedReply =
  "Ótimo! Vou iniciar o acesso remoto, é só aceitar o pedido que vai aparecer na tela.";

export const loginDemo = {
  question: "Meu notebook não conecta na VPN. Erro 809.",
  answer:
    "Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.",
  ticket: "INC-20517",
};

export const chatCopy = {
  vpnQuestion:
    "Meu notebook não conecta na VPN desde ontem. Aparece o erro 809.",
  vpnAnswer:
    "Não há chamado aberto sobre VPN, e o artigo do erro 809 vale só para Windows 10 — o seu é Windows 11. Vou abrir um chamado.",
  impactReply:
    "Só eu. Tenho reunião com um cliente às 14h e preciso da VPN funcionando.",
  draftAnswer:
    "Coloquei prioridade alta por causa da reunião — a resposta chega antes das 14h. Confira antes de eu criar:",
  statusQuestion: "Qual o status do meu chamado?",
  transfer:
    "Encaminhei para o Suporte N2. Um analista vai falar com você em até 2 h úteis.",
};
