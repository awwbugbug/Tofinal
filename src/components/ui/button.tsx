import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[18px] text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring-soft)] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent)] text-white shadow-[var(--shadow-subtle)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-hover)]",
        secondary:
          "border border-[var(--border-soft)] bg-[var(--accent-surface)] text-[var(--accent-hover)] hover:bg-[var(--accent-soft)] active:bg-[var(--accent-soft)]",
        ghost: "text-[var(--text-muted)] hover:bg-[var(--accent-surface)] hover:text-[var(--accent-hover)] active:bg-[var(--accent-soft)]",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      type={type}
      {...props}
    />
  );
}
