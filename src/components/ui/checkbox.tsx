import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export function Checkbox({ checked, className, ...props }: CheckboxProps) {
  return (
    <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
      <input
        checked={checked}
        className={cn(
          "peer h-5 w-5 cursor-pointer appearance-none rounded-full border border-[var(--border-medium)] bg-[var(--surface-card)] transition-colors checked:border-[var(--accent)] checked:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-soft)]",
          className,
        )}
        type="checkbox"
        {...props}
      />
      <Check className="pointer-events-none absolute h-3 w-3 text-white opacity-0 peer-checked:opacity-100" />
    </span>
  );
}
