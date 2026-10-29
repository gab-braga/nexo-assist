import {
  ConversationPage,
  type ConversationSearch,
} from "@/components/conversation-page";

export default function AgentPage({
  searchParams,
}: {
  searchParams: ConversationSearch;
}) {
  return <ConversationPage role="agent" searchParams={searchParams} />;
}
