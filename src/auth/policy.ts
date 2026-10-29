import type { Conversation, SessionUser } from "@/types/domain";

export function canReadConversation(
  user: SessionUser,
  conversation: Conversation,
) {
  return user.role === "agent" || conversation.customerId === user.uid;
}

export function canSendMessage(user: SessionUser, conversation: Conversation) {
  return (
    canReadConversation(user, conversation) &&
    conversation.status !== "closed" &&
    (user.role === "chat" || conversation.agentId === user.uid)
  );
}
