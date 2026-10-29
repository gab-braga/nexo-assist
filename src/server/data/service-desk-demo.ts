import { ticketDeadline, ticketPriority } from "@/server/policies/tickets";
import type { KnowledgeArticle, Ticket, TicketData } from "@/types/tickets";
import type { Conversation, Message } from "@/types/domain";
import { buildHandoffSummary } from "@/server/policies/handoff";

export const demoEmployees = [
  {
    uid: "nexo-demo-employee-1",
    name: "Ana Demonstração",
    email: "ana@nexo-demo.example.test",
  },
  {
    uid: "nexo-demo-employee-2",
    name: "Bruno Demonstração",
    email: "bruno@nexo-demo.example.test",
  },
];

export const demoAnalysts = [
  {
    uid: "nexo-demo-analyst-1",
    name: "Carla Demonstração",
    email: "carla@nexo-demo.example.test",
  },
];
export const demoIdentities = [
  ...demoEmployees.map((employee) => ({ ...employee, role: "chat" as const })),
  ...demoAnalysts.map((analyst) => ({ ...analyst, role: "agent" as const })),
];

/** Fixed identities and IDs make reruns additive, never replacements. */
export function demoConversations(now: Date) {
  const tickets = demoTickets(now);
  const conversations: Conversation[] = [
    "IA",
    "Fila humana",
    "Atendimento humano",
    "Encerrado",
  ].map((name, index) => {
    const owner = demoEmployees[index === 3 ? 1 : 0];
    const createdAt = new Date(now.getTime() - (index + 1) * 3600000);
    const id = `dc000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const conversation: Conversation = {
      _id: id,
      customerId: owner.uid,
      customerName: owner.name,
      subject: `Demonstração: ${name}`,
      status: index === 3 ? "closed" : index === 2 ? "active" : "waiting",
      agentId: index === 2 ? demoAnalysts[0].uid : null,
      agentName: index === 2 ? demoAnalysts[0].name : null,
      aiEnabled: true,
      aiHandoff: index > 0,
      aiControlVersion: 0,
      aiMessageCount: 0,
      version: 1,
      createdAt,
      updatedAt: createdAt,
      initialMessageId: `dd000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      ...(index < 3
        ? { selectedTicketId: tickets[index === 2 ? 1 : 0]._id }
        : {}),
      ...(index === 2 ? { assignedAt: createdAt.toISOString() } : {}),
      ...(index === 3 ? { closedAt: createdAt.toISOString() } : {}),
    };
    if (index > 0)
      conversation.handoff = {
        id: `demo-handoff-${index}`,
        reason: "requested",
        requestedAt: createdAt.toISOString(),
        summary: buildHandoffSummary(
          conversation,
          "Cenário fictício criado pelo seed para demonstrar a navegação e o atendimento humano.",
        ),
      };
    return conversation;
  });
  const messages: Message[] = conversations.map((conversation) => ({
    _id: conversation.initialMessageId!,
    conversationId: conversation._id,
    authorId: conversation.customerId,
    authorName: conversation.customerName,
    role: "chat",
    text: "Este é um atendimento fictício de demonstração. Preciso de ajuda com meu equipamento.",
    createdAt: conversation.createdAt,
    sequence: 1,
    processingState: "completed",
  }));
  return { conversations, messages };
}

export const demoArticles: KnowledgeArticle[] = [
  {
    _id: "demo-vpn-809",
    title: "VPN com erro 809",
    content:
      "No Windows 10, reinstale o cliente de VPN pelo portal de softwares e reinicie. No Windows 11, abra um chamado.",
    keywords: ["VPN", "809", "Windows"],
    applicability: [
      "Reinstalação: somente Windows 10",
      "Windows 11: abrir chamado",
    ],
    category: "Rede e VPN",
    version: 1,
  },
  {
    _id: "demo-hours",
    title: "Horário do service desk",
    content:
      "Segunda a sexta, das 8h às 18h em São Paulo. Chamados críticos têm plantão 24 horas.",
    keywords: ["horário", "plantão"],
    applicability: ["Calendário demonstrativo sem feriados"],
    category: "Outros",
    version: 1,
  },
  {
    _id: "demo-access",
    title: "Solicitar acesso a sistemas",
    content:
      "Informe o sistema e o perfil de acesso necessário. Registre uma requisição; a aprovação depende do responsável pelo sistema.",
    keywords: ["acesso", "permissão", "REQ"],
    applicability: ["Novos acessos corporativos"],
    category: "Acesso",
    version: 1,
  },
  {
    _id: "demo-hardware",
    title: "Pedido de equipamento",
    content:
      "Informe o equipamento, motivo e quem será atendido. Pedidos sem urgência são requisições de prioridade baixa.",
    keywords: ["monitor", "notebook", "equipamento"],
    applicability: ["Pedidos, não falhas de equipamento"],
    category: "Hardware",
    version: 1,
  },
  {
    _id: "demo-software",
    title: "Instalar software corporativo",
    content:
      "Verifique primeiro o portal de softwares. Se o aplicativo não estiver disponível, solicite a instalação informando nome e finalidade.",
    keywords: ["instalação", "software", "portal"],
    applicability: ["Computadores corporativos gerenciados"],
    category: "Software",
    version: 1,
  },
  {
    _id: "demo-email",
    title: "E-mail não chega",
    content:
      "Confira spam e espaço disponível. Informe remetente, horário e mensagem de erro ao solicitar suporte. Nunca envie sua senha.",
    keywords: ["e-mail", "spam", "caixa"],
    applicability: ["Correio corporativo"],
    category: "E-mail",
    version: 1,
  },
];

export function demoTickets(now: Date): Ticket[] {
  const cases: {
    data: TicketData;
    owner: number;
    age: number;
    resolved?: boolean;
  }[] = [
    {
      owner: 0,
      age: 0,
      data: {
        title: "VPN não conecta",
        description: "Erro 809 no Windows 11, sem acesso aos sistemas.",
        type: "INC",
        category: "Rede e VPN",
        impact: "person",
        urgency: "blocked",
      },
    },
    {
      owner: 0,
      age: 10,
      data: {
        title: "Notebook lento",
        description:
          "Lentidão após atualização, existe outro computador disponível.",
        type: "INC",
        category: "Hardware",
        impact: "person",
        urgency: "workaround",
      },
    },
    {
      owner: 0,
      age: 4,
      resolved: true,
      data: {
        title: "Senha do SAP bloqueada",
        description: "Acesso ao SAP foi restabelecido pelo suporte.",
        type: "INC",
        category: "Acesso",
        impact: "person",
        urgency: "workaround",
      },
    },
    {
      owner: 1,
      age: 0,
      data: {
        title: "Segundo monitor",
        description: "Pedido de segundo monitor para o trabalho remoto.",
        type: "REQ",
        category: "Hardware",
        impact: "person",
        urgency: "normal",
      },
    },
    {
      owner: 1,
      age: 2,
      data: {
        title: "E-mail da equipe parado",
        description: "Toda a equipe está sem enviar ou receber mensagens.",
        type: "INC",
        category: "E-mail",
        impact: "team",
        urgency: "blocked",
      },
    },
    {
      owner: 1,
      age: 0,
      data: {
        title: "Instalar editor",
        description: "Solicitação de instalação para compromisso hoje.",
        type: "REQ",
        category: "Software",
        impact: "person",
        urgency: "today",
      },
    },
  ];

  return cases.map((item, index) => {
    const owner = demoEmployees[item.owner];
    const date = new Date(now.getTime() - item.age * 86400000);
    const priority = ticketPriority(item.data);
    return {
      ...item.data,
      _id: `de000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      number: `${item.data.type}-DEMO-${index + 1}`,
      customerId: owner.uid,
      customerName: owner.name,
      priority,
      status: item.resolved ? "resolved" : "open",
      createdAt: date,
      updatedAt: date,
      lastServiceUpdateAt: date,
      nextResponseDueAt: ticketDeadline(date, priority),
      resolvedAt: item.resolved ? date : null,
      version: 0,
    };
  });
}
