import {
  ConversationPage,
  type ConversationSearch,
} from "@/components/conversation/conversation-page";

type Props = {
  searchParams: ConversationSearch;
};

export default function AgentPage({ searchParams }: Props) {
  return <ConversationPage role="agent" searchParams={searchParams} />;
}
