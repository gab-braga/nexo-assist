import type {
  Conversation,
  ConversationOperationalState,
} from "@/types/domain";

/** One canonical interpretation of the existing persisted fields; no second state machine. */
export function conversationState(
  conversation: Conversation,
): ConversationOperationalState {
  if (conversation.status === "closed") return "CLOSED";
  if (conversation.status === "active") return "ANALYST_ACTIVE";
  return conversation.aiEnabled &&
    !conversation.aiHandoff &&
    !conversation.agentId
    ? "AGENT_ACTIVE"
    : "WAITING_FOR_ANALYST";
}

export function canProcessAgent(conversation: Conversation) {
  return conversationState(conversation) === "AGENT_ACTIVE";
}
