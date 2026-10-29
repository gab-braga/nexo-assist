import {
  ConversationPage,
  type ConversationSearch,
} from "@/components/conversation/conversation-page";

type Props = {
  searchParams: ConversationSearch;
};

export default function ChatPage({ searchParams }: Props) {
  return <ConversationPage role="chat" searchParams={searchParams} />;
}
