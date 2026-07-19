import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "glass-button glass-highlight inline-flex shrink-0 items-center justify-center gap-2 rounded-[18px] text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-soft)] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default: "glass-button-primary",
        secondary: "glass-button-secondary text-[var(--accent-hover)]",
        ghost: "glass-button-ghost text-[var(--text-muted)] hover:text-[var(--accent-hover)]",
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
  VariantProps<typeof buttonVariants> & {
    edgeSafe?: boolean;
  };

export function Button({ className, edgeSafe = false, variant, size, type = "button", ...props }: ButtonProps) {
  const edgeSafeClassName = edgeSafe && size === "icon" ? "glass-icon-button glass-icon-button-safe" : undefined;

  return (
    <button
      className={cn(buttonVariants({ variant, size }), edgeSafeClassName, className)}
      type={type}
      {...props}
    />
  );
}
