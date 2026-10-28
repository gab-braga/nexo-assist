import { Shell } from "@/components/shell";

type Props = {
  children: React.ReactNode;
};

export default async function ChatLayout({ children }: Props) {
  return <Shell>{children}</Shell>;
}
