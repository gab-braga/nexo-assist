export const ticketCategories = [
  "Acesso",
  "Rede e VPN",
  "Hardware",
  "Software",
  "E-mail",
  "Outros",
] as const;

export type TicketCategory = (typeof ticketCategories)[number];

export type TicketPriority = "critical" | "high" | "medium" | "low";

export type TicketStatus = "open" | "waiting_human" | "resolved";

export type TicketOperation = "create" | "update" | "reopen" | "handoff";

export type TicketData = {
  title: string;
  description: string;
  type: "INC" | "REQ";
  category: TicketCategory;
  impact: "person" | "team" | "company";
  urgency: "blocked" | "today" | "workaround" | "normal";
};

export type Ticket = TicketData & {
  _id: string;
  number: string;
  customerId: string;
  customerName: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: Date;
  updatedAt: Date;
  lastServiceUpdateAt: Date;
  nextResponseDueAt: Date;
  resolvedAt: Date | null;
  version: number;
};

export type TicketDraft = {
  _id: string;
  customerId: string;
  customerName: string;
  operation: TicketOperation;
  ticketId: string;
  expectedVersion: number | null;
  data: TicketData;
  reason: string | null;
  digest: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  appliedAt: Date | null;
  result: Ticket | null;
  cancelledAt?: Date | null;
  conversationId?: string;
  controlVersion?: number;
  sourceRunId?: string;
  confirmationMessageId?: string;
};

export type TicketEvent = {
  _id: string;
  ticketId: string;
  actorId: string;
  operation: TicketOperation | "resolve" | "service_update";
  reason: string | null;
  before: Ticket | null;
  after: Ticket;
  createdAt: Date;
};

export type KnowledgeArticle = {
  _id: string;
  title: string;
  content: string;
  keywords: string[];
  applicability: string[];
  category: TicketCategory;
  version: number;
};

export type TicketDTO = Omit<
  Ticket,
  | "createdAt"
  | "updatedAt"
  | "lastServiceUpdateAt"
  | "nextResponseDueAt"
  | "resolvedAt"
> & {
  createdAt: string;
  updatedAt: string;
  lastServiceUpdateAt: string;
  nextResponseDueAt: string;
  resolvedAt: string | null;
  overdue: boolean;
};

export type TicketDraftView = {
  draftId: string;
  digest: string;
  operation: TicketOperation;
  data: TicketData;
  priority: TicketPriority;
  affectedEmployee: string;
  reason: string | null;
  expiresAt: string;
  state: "pending" | "expired" | "cancelled" | "applied";
};

export type ConversationInteraction = {
  canConfirm: boolean;
  flow: import("./domain").ConversationFlow | null;
  draft: TicketDraftView | null;
  tickets: TicketDTO[];
  selectedTicket: TicketDTO | null;
};
