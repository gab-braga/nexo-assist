import { protectPage } from "@/auth/guards";

export const runtime = "nodejs";

type Props = {
  children: React.ReactNode;
};

export default async function AgentLayout({ children }: Props) {
  await protectPage("agent");
  return children;
}
