"use client";
import { AgentWorkspace } from "./agent-workspace";
import { ChatWorkspace } from "./chat-workspace";
import type { WorkspaceProps } from "./use-conversation-workspace";

export function ConversationWorkspace(props: WorkspaceProps) {
  return props.user.role === "agent" ? (
    <AgentWorkspace {...props} />
  ) : (
    <ChatWorkspace {...props} />
  );
}
