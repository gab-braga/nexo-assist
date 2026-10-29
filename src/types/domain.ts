export type UserRole = "chat" | "agent";

export type ConversationStatus = "waiting" | "active" | "closed";
export type ConversationOperationalState =
  | "AGENT_ACTIVE"
  | "WAITING_FOR_ANALYST"
  | "ANALYST_ACTIVE"
  | "CLOSED";
export type MessageProcessingState =
  | "processing"
  | "completed"
  | "interrupted"
  | "failed";
export type ConversationContextPatch = {
  selectedTicketId?: string | null;
  pendingDraftId?: string | null;
  flow?: ConversationFlow;
};

export type ConversationFlow = {
  intent:
    | "knowledge"
    | "tickets"
    | "status"
    | "create"
    | "update"
    | "reopen"
    | "handoff"
    | "clarify"
    | "out_of_scope";
  stage:
    | "collecting"
    | "selecting"
    | "knowledge"
    | "awaiting_confirmation"
    | "idle";
  data?: Partial<import("./tickets").TicketData>;
  environment?: string;
  question?: string;
  choices?: { label: string; message: string }[];
  ticketIds?: string[];
};

export type HandoffReason = "requested" | "critical" | "overdue" | "uncertain";
export type HandoffSummary = {
  problem: string;
  information: string[];
  relatedTickets: {
    id: string;
    number: string;
    title: string;
    status: string;
  }[];
  guidance: string[];
  operations: string[];
  pending: string[];
  agentNote: string;
};

export type SessionUser = {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
};

export type Conversation = {
  handoff?: {
    id: string;
    messageId?: string;
    reason: HandoffReason;
    requestedAt: string;
    summary: HandoffSummary;
  };
  assignedAt?: string | null;
  returnedAt?: string | null;
  closedAt?: string | null;
  analystSummary?: string;
  _id: string;
  customerId: string;
  customerName: string;
  subject: string;
  status: ConversationStatus;
  agentId: string | null;
  agentName: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  aiEnabled?: boolean;
  aiHandoff?: boolean;
  aiMessageCount?: number;
  aiActiveRunId?: string | null;
  aiControlVersion?: number;
  initialMessageId?: string;
  selectedTicketId?: string | null;
  pendingDraftId?: string | null;
  flow?: ConversationFlow;
};

export type Message = {
  observability?: {
    runId: string;
    model: string;
    elapsedMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    traceId?: string;
  };
  actions?: import("@/lib/schemas/agent-actions").AgentAction[];
  _id: string;
  conversationId: string;
  authorId: string;
  authorName: string;
  role: UserRole | "assistant";
  text: string;
  createdAt: Date;
  sequence?: number;
  runId?: string;
  processingState?: MessageProcessingState;
  processingErrorCode?: string | null;
  decisionRefs?: string[];
  ticket?: import("./tickets").TicketDTO;
};

export type ConversationDTO = Omit<Conversation, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
  operationalState?: ConversationOperationalState;
};

export type MessageDTO = Omit<Message, "createdAt"> & { createdAt: string };

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };
