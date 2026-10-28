import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  color?: string;
  pill?: boolean;
};

export function Status({ children, color = "green", pill = false }: Props) {
  return (
    <span
      data-slot="status"
      className={cn(
        "inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap text-muted-foreground",
        color === "amber" && "text-[#946000]",
        color === "red" && "text-[#e00012]",
        pill &&
          "rounded-[99px] py-1 px-2.5 bg-[#eafaf2] text-[#008855] font-medium",
        pill && color === "amber" && "bg-[#fff8e8] text-[#946000]",
      )}
    >
      <i
        className={cn(
          "size-1.5 shrink-0 rounded-full bg-[#00bd7d]",
          color === "amber" && "bg-[#f5a400]",
          color === "blue" && "bg-[#0785ff]",
          color === "red" && "bg-[#ff3449]",
          color === "gray" && "bg-[#b2b7bf]",
          color === "green" && "bg-[#00bc7c]",
        )}
      />
      {children}
    </span>
  );
}
