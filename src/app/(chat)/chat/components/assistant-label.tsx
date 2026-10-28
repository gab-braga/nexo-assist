import { Check } from "lucide-react";

export function AssistantLabel({ actions }: { actions: string[] }) {
  return (
    <div
      data-visual="assistant-label"
      className="flex items-center gap-3.5 text-[12px] text-muted-foreground mb-1 min-h-4.25 [&>strong]:font-medium [&>strong]:text-foreground [&>span]:flex [&>span]:items-center [&>span]:gap-1.25 group-data-[mode=new]/chat:mb-0.75 max-[800.001px]:flex-wrap max-[800.001px]:gap-x-2.5 max-[800.001px]:gap-y-1 max-[800.001px]:text-[10px] max-[540.001px]:[&>span]:text-[9px]"
    >
      <strong>Nexo Assist</strong>
      {actions.map((action) => (
        <span key={action}>
          <Check size={12} />
          {action}
        </span>
      ))}
    </div>
  );
}
