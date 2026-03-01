import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold tracking-[0.01em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#940202]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-disabled:pointer-events-none aria-disabled:opacity-70 disabled:pointer-events-none disabled:opacity-70",
  {
    variants: {
      variant: {
        default:
          "bg-[#940202] text-white shadow-[0_8px_18px_rgba(148,2,2,0.22)] hover:-translate-y-0.5 hover:bg-[#B30303] hover:shadow-[0_12px_24px_rgba(148,2,2,0.28)] active:translate-y-0 active:bg-[#6E0101] disabled:bg-[#D9A5A5] disabled:text-white",
        outline:
          "border-2 border-[#940202] bg-[#FFF8F0] text-[#940202] shadow-[0_5px_14px_rgba(58,42,30,0.07)] hover:-translate-y-0.5 hover:bg-[#fff2e5] hover:border-[#B30303] hover:text-[#B30303] active:translate-y-0 active:border-[#6E0101] active:text-[#6E0101] disabled:border-[#D9A5A5] disabled:text-[#D9A5A5]",
        ghost:
          "bg-transparent text-[#3A2A1E] hover:bg-[#edd8c2] hover:text-[#940202] active:bg-[#e4ccb2]",
      },
      size: {
        default: "h-11 px-5 text-[0.95rem]",
        sm: "h-10 rounded-xl px-4 text-sm",
        lg: "h-12 rounded-2xl px-8 text-base",
        icon: "h-11 w-11 rounded-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => {
    const ariaDisabled = props["aria-disabled"] === true || props["aria-disabled"] === "true";
    const isDisabled = disabled || ariaDisabled || loading;

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
