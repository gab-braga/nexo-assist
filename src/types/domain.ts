export type UserRole = "chat" | "agent";

export type ConversationStatus = "waiting" | "active" | "closed";

export type SessionUser = {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
};

export type Conversation = {
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
};

export type Message = {
  _id: string;
  conversationId: string;
  authorId: string;
  authorName: string;
  role: UserRole | "assistant";
  text: string;
  createdAt: Date;
};

export type ConversationDTO = Omit<Conversation, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

export type MessageDTO = Omit<Message, "createdAt"> & { createdAt: string };

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };
