import { protectPage } from "@/auth/guards";
import { ConversationWorkspace } from "./conversation-workspace";
import {
  getMessages,
  listConversations,
  getAnalystContext,
} from "@/server/services/conversations";
import { result } from "@/server/lib/errors";
import type { UserRole } from "@/types/domain";
import { ticketService } from "@/server/services/tickets";

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

type Props = {
  role: UserRole;
  searchParams: ConversationSearch;
};

export async function ConversationPage({ role, searchParams }: Props) {
  const user = await protectPage(role);
  const params = await searchParams;
  const search = value(params.search);
  const status = value(params.status) || "all";
  const id = value(params.conversation);
  const before = value(params.before);

  const data = await result(async () => {
    const [list, history] = await Promise.all([
      listConversations({
        search,
        status,
        cursor: cursor(value(params.cursor)),
      }),
      id ? getMessages({ conversationId: id, cursor: cursor(before) }) : null,
    ]);
    const interaction =
      role === "chat" && id && !before
        ? await result(() => ticketService.getConversationInteraction(id))
        : null;
    const analystContext =
      role === "agent" && id ? await result(() => getAnalystContext(id)) : null;
    return {
      analystContext: analystContext?.ok ? analystContext.data : null,
      list,
      conversation: history?.conversation ?? null,
      history,
      interaction: interaction?.ok ? interaction.data : null,
    };
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
