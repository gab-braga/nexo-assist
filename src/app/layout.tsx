import type { Metadata } from "next";
import { sans, serif } from "@/lib/font";
import "@/style/globals.css";

export const metadata: Metadata = {
  title: "Nexo Assist | Service desk de TI",
  description: "Seu problema de TI, resolvido em uma conversa.",
};

type Props = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: Props) {
  return (
    <html
      lang="pt-BR"
      className={`${sans.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="m-0 bg-background font-sans text-[14px] text-foreground">{children}</body>
    </html>
  );
}
