import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border border-[#c2a98f]/50 bg-white px-3 py-2 text-sm text-[#2D1F16] ring-offset-white placeholder:text-[#8f7664] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828]/40",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
