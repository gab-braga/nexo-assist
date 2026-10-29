import type { Message, MessageDTO, ConversationContextPatch } from "./domain";
import type { TicketData, TicketStatus } from "./tickets";

export type AgentIntent =
  | "knowledge"
  | "tickets"
  | "status"
  | "create"
  | "update"
  | "reopen"
  | "handoff"
  | "clarify"
  | "out_of_scope";

export type AgentAudit = {
  kind: "model_decision" | "tool_result" | "service_validation";
  intent: AgentIntent;
  tool: string;
  rationale: string;
  parameters: Record<string, string | number | boolean>;
  outcome: "success" | "failure";
  code?: string;
  evidenceIds: string[];
  at: string;
};

export type AgentRun = {
  _id: string;
  conversationId: string;
  customerId: string;
  inputHash: string;
  controlVersion: number;
  state: "running" | "completed" | "failed" | "interrupted";
  createdAt: Date;
  expiresAt: Date;
  completedAt: Date | null;
  response: string | null;
  responseId: string;
  responseCreatedAt?: Date | null;
  responseSequence?: number | null;
  errorCode: string | null;
  model: string;
  promptVersion: string;
  audit: AgentAudit[];
  usage: { inputTokens: number; outputTokens: number } | null;
  contextReferences?: ConversationContextPatch;
};

export type AgentMemorySnapshot = {
  analystSummary?: string;
  flow?: import("./domain").ConversationFlow;
  initialMessage: Message | null;
  recentMessages: Message[];
  selectedTicket: {
    id: string;
    title: string;
    status: TicketStatus;
    version: number;
  } | null;
  pendingOperation: {
    draftId: string;
    ticketId: string;
    operation: "create" | "update" | "reopen" | "handoff";
    state: "pending" | "expired" | "applied" | "cancelled";
    data: TicketData;
  } | null;
};

export type AgentStreamEvent =
  | { type: "started"; runId: string; conversationId?: string }
  | { type: "delta"; text: string }
  | { type: "completed"; message: MessageDTO }
  | { type: "error"; code: string; error: string };
