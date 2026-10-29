"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  trigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  trigger?: React.ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <D.Trigger asChild>{trigger}</D.Trigger>}
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-slate-950/30" />
        <D.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white p-6 shadow-xl"
        >
          <D.Title className="mb-4 text-lg font-semibold">{title}</D.Title>
          {children}
          <D.Close aria-label="Fechar" className="absolute right-4 top-4">
            <X size={18} />
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
