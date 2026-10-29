import { Shell } from "@/components/shell";
import { protectPage } from "@/auth/guards";

type Props = {
  children: React.ReactNode;
};

export default async function ChatLayout({ children }: Props) {
  const user = await protectPage("chat");
  return <Shell user={user}>{children}</Shell>;
}
