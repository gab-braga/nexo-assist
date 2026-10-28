import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const variants = cva(
  "cursor-pointer [-webkit-tap-highlight-color:transparent] disabled:cursor-default focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-border bg-white hover:bg-muted shadow-xs",
        ghost: "hover:bg-muted",
        destructive: "bg-red-50 text-red-600 hover:bg-red-100",
      },
      size: { default: "h-9 px-3", icon: "size-9", lg: "h-11 px-5" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(variants({ variant, size, className }))} {...props} />
  );
}
