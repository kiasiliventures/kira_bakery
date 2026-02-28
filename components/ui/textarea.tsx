import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "min-h-[100px] w-full rounded-xl border border-[#c2a98f]/50 bg-white px-3 py-2 text-sm text-[#2D1F16] ring-offset-white placeholder:text-[#8f7664] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828]/40",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
