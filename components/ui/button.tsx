import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold tracking-[0.01em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-disabled:pointer-events-none aria-disabled:opacity-70 disabled:pointer-events-none disabled:opacity-70",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-accent-foreground shadow-[var(--shadow-brand)] hover:-translate-y-0.5 hover:bg-[var(--accent-hover)] active:translate-y-0 active:bg-[var(--accent-active)] disabled:bg-[var(--accent-disabled)] disabled:text-accent-foreground",
        outline:
          "border-2 border-accent bg-surface text-accent shadow-[var(--shadow-soft)] hover:-translate-y-0.5 hover:bg-surface-alt hover:border-[var(--accent-hover)] hover:text-[var(--accent-hover)] active:translate-y-0 active:border-[var(--accent-active)] active:text-[var(--accent-active)] disabled:border-[var(--accent-disabled)] disabled:text-[var(--accent-disabled)]",
        ghost:
          "bg-transparent text-foreground hover:bg-surface-muted hover:text-accent active:bg-surface-alt",
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
