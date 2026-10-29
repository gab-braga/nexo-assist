import type { MessageDTO } from "./domain";

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
  state: "running" | "completed" | "failed";
  createdAt: Date;
  expiresAt: Date;
  completedAt: Date | null;
  response: string | null;
  responseId: string;
  errorCode: string | null;
  model: string;
  promptVersion: string;
  audit: AgentAudit[];
  usage: { inputTokens: number; outputTokens: number } | null;
};

export type AgentStreamEvent =
  | { type: "started"; runId: string; conversationId?: string }
  | { type: "delta"; text: string }
  | { type: "completed"; message: MessageDTO }
  | { type: "error"; code: string; error: string };
