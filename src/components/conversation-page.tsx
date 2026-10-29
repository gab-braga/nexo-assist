import { protectPage } from "@/auth/guards";
import { ConversationWorkspace } from "./conversation-workspace";
import {
  getConversation,
  getMessages,
  listConversations,
} from "@/server/services/conversations";
import { result } from "@/server/lib/errors";
import type { UserRole } from "@/types/domain";

export type ConversationSearch = Promise<
  Record<string, string | string[] | undefined>
>;
function value(input: string | string[] | undefined) {
  return typeof input === "string" ? input : "";
}
function cursor(input: string) {
  if (!input) return undefined;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

export async function ConversationPage({
  role,
  searchParams,
}: {
  role: UserRole;
  searchParams: ConversationSearch;
}) {
  const user = await protectPage(role);
  const params = await searchParams;
  const search = value(params.search);
  const status = value(params.status) || "all";
  const id = value(params.conversation);
  const before = value(params.before);
  const data = await result(async () => {
    const [list, conversation, history] = await Promise.all([
      listConversations({
        search,
        status,
        cursor: cursor(value(params.cursor)),
      }),
      id ? getConversation(id) : null,
      id ? getMessages({ conversationId: id, cursor: cursor(before) }) : null,
    ]);
    return { list, conversation, history };
  });
  if (!data.ok)
    return (
      <main className="p-8">
        <h1 className="mb-4 text-2xl">Atendimentos</h1>
        <p role="alert">{data.error}</p>
        <a
          className="mt-4 block text-primary"
          href={role === "agent" ? "/agent" : "/chat"}
        >
          Voltar aos atendimentos
        </a>
      </main>
    );
  return (
    <ConversationWorkspace
      key={id}
      user={user}
      {...data.data}
      search={search}
      status={status}
      older={Boolean(before)}
    />
  );
}
