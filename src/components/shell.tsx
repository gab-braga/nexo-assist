"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { ChevronRight, LogOut, MessageSquare, UserRound } from "lucide-react";
import { Avatar } from "./avatar";
import type { SessionUser } from "@/types/domain";
import { logout } from "@/server/actions/auth";

type Props = {
  children: React.ReactNode;
  user: SessionUser;
};

const links = [
  { label: "Atendimento", icon: <MessageSquare />, to: "/chat" },
  { label: "Meu Perfil", icon: <UserRound />, to: "/profile" },
];

export function Shell({ children, user }: Props) {
  const pathname = usePathname();
  const active = links.find((link) => link.to === pathname);

  return (
    <div data-visual="customer-shell" className="flex min-h-dvh">
      <aside
        data-visual="customer-sidebar"
        className="fixed inset-y-0 left-0 z-10 flex w-58 flex-col border-r border-border bg-card pt-4.75 px-3.5 pb-5.25 [&>a]:mx-2 [&>a]:mb-5 [&>a]:text-[16px] [&>nav]:flex [&>nav]:flex-col [&>nav]:gap-0.5 [&>nav>a]:h-9 [&>nav>a]:rounded-lg [&>nav>a]:flex [&>nav>a]:items-center [&>nav>a]:gap-2.5 [&>nav>a]:px-2.5 [&>nav>a]:text-[13px] [&>nav>a]:text-[#344156] [&>nav_svg]:size-4 [&>nav_svg]:stroke-[1.6] max-[800.001px]:w-45 max-[800.001px]:pt-4.5 max-[800.001px]:px-2.5 max-[800.001px]:[&>a]:text-[14px] max-[800.001px]:[&>a]:gap-1.25 max-[800.001px]:[&>a>b]:text-[25px] max-[540.001px]:w-15.5 max-[540.001px]:pt-5 max-[540.001px]:px-2 max-[540.001px]:[&>a>span]:text-[0px] max-[540.001px]:[&>a>span]:gap-0 max-[540.001px]:[&>a]:mx-auto max-[540.001px]:[&>a]:mb-6 max-[540.001px]:[&>nav>a]:text-[0px] max-[540.001px]:[&>nav>a]:gap-0 max-[540.001px]:[&>nav>a]:justify-center max-[540.001px]:[&>nav_svg]:size-4.75"
      >
        <div className="flex gap-2.5 items-center mb-5.5 px-3">
          <Image
            src="/nexo-assist-dark.svg"
            width={20}
            height={20}
            alt="Nexo Assistant"
          />
          <span className="text-lg font-bold text-nowrap">Nexo Assist</span>
        </div>

        <nav>
          {links.map((link) => (
            <Link
              key={link.label}
              className={cn(
                "cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 text-inherit no-underline",
                active &&
                  active.to === link.to &&
                  "[&&]:text-primary [&&]:bg-secondary [&&]:font-medium",
              )}
              href={link.to}
            >
              {link.icon}
              {link.label}
            </Link>
          ))}
        </nav>

        <div
          data-visual="sidebar-bottom"
          className="group/account mt-auto border-t border-border pt-3.25 px-2 [&>a]:flex [&>a]:items-center [&>a]:gap-2.75 [&>a]:text-[13px] [&>a]:mt-3 [&>a]:text-[#344156] max-[800.001px]:pl-0.5 max-[540.001px]:pt-3 max-[540.001px]:[&>a]:hidden"
        >
          <div
            data-visual="user-info"
            className="flex items-center gap-2.5 *:data-[slot=avatar]:size-8.5 *:data-[slot=avatar]:text-[12px] *:data-[slot=avatar]:bg-secondary [&_strong]:block [&_strong]:text-[13px] [&_strong]:font-medium [&_small]:block [&_small]:text-2.75 max-[800.001px]:[&_small]:text-[9px] max-[540.001px]:[&>div]:hidden"
          >
            <Avatar
              initials={user.name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            />
            <div>
              <strong>{user.name}</strong>
              <small className="text-[12px] text-muted-foreground">
                {user.email}
              </small>
            </div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="mt-3 flex cursor-pointer items-center gap-2.75 text-[13px] text-[#344156] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3"
            >
              <LogOut size={16} />
              Sair
            </button>
          </form>
        </div>
      </aside>

      <div
        data-visual="customer-main"
        className="ml-58 w-[calc(100%-232px)] max-[800.001px]:ml-45 max-[800.001px]:w-[calc(100%-180px)] max-[540.001px]:ml-15.5 max-[540.001px]:w-[calc(100%-62px)]"
      >
        <header
          data-visual="customer-header"
          className="h-16 border-b border-border flex items-center px-8 gap-2.75 text-[13px] [&>span:first-child]:text-muted-foreground [&>strong]:font-medium *:data-[slot=status]:ml-auto max-[800.001px]:px-5 max-[800.001px]:gap-2 max-[800.001px]:*:data-[slot=status]:text-[10px] max-[800.001px]:*:data-[slot=status]:py-0.75 max-[800.001px]:*:data-[slot=status]:px-1.5 max-[540.001px]:h-14.5 max-[540.001px]:px-3 max-[540.001px]:text-2.75 max-[540.001px]:gap-1 max-[540.001px]:[&>span:first-child]:hidden max-[540.001px]:[&>svg]:hidden max-[540.001px]:*:data-[slot=status]:text-[9px]"
        >
          <span>Service desk de TI</span>
          {active && (
            <>
              <ChevronRight size={12} />
              <span>{active.label}</span>
            </>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}
