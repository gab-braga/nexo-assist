import { cn } from "@/lib/utils";

type Props = {
  initials?: string;
  tone?: string;
  online?: boolean;
};

export function Avatar({
  initials = "?",
  tone = "blue",
  online = false,
}: Props) {
  return (
    <span
      data-visual="menu-anchor"
      data-slot="avatar"
      className={cn(
        "relative inline-flex items-center justify-center shrink-0 size-10.5 rounded-full font-semibold text-[14px] bg-[#deedfc] text-primary uppercase",
        tone === "orange" && "bg-[#f7e2d0] text-[#a9510a]",
        tone === "purple" && "bg-[#e6dff8] text-[#6c3be5]",
        tone === "green" && "bg-[#dcefe5] text-[#168251]",
        tone === "pink" && "bg-[#f8e0e7] text-[#b62c55]",
        tone === "gray" && "bg-[#e5e8ed] text-[#4a5566]",
        tone === "yellow" && "bg-[#fcf0cd] text-[#997000]",
      )}
    >
      {initials}
      {online && (
        <i className="absolute bottom-0 right-0 bg-[#00bd7d] size-3 border-2 border-white rounded-full" />
      )}
    </span>
  );
}
