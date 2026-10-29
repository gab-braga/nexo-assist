import {
  ConversationPage,
  type ConversationSearch,
} from "@/components/conversation-page";

export default function ChatPage({
  searchParams,
}: {
  searchParams: ConversationSearch;
}) {
  return <ConversationPage role="chat" searchParams={searchParams} />;
}
