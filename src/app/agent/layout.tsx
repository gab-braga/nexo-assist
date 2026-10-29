import { protectPage } from "@/auth/guards";
import { logout } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";

export const runtime = "nodejs";

type Props = {
  children: React.ReactNode;
};

export default async function AgentLayout({ children }: Props) {
  const user = await protectPage("agent");

  return (
    <div className="min-h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-card px-6 py-4">
        <strong>Nexo Assist · Atendimento</strong>
        <span>{user.name}</span>
        <form action={logout}>
          <Button variant="outline">Sair</Button>
        </form>
      </header>
      {children}
    </div>
  );
}
