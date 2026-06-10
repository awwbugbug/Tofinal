import * as React from "react";

import { cn } from "@/lib/utils";

export function Input({ className, type = "text", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "focus-soft surface-input h-10 w-full rounded-[18px] border px-4 text-sm text-[var(--text-secondary)] placeholder:text-[var(--text-faint)]",
        className,
      )}
      type={type}
      {...props}
    />
  );
}
