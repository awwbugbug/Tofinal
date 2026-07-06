import { cn } from "@/lib/utils";

type TrashBinIconProps = {
  open?: boolean;
  className?: string;
};

/**
 * Two-part trash bin: the lid is a separate group so it can swing open while
 * a dragged card hovers over the bin.
 */
export function TrashBinIcon({ className, open = false }: TrashBinIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={cn("trash-bin-icon", open && "trash-bin-icon-open", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g className="trash-bin-icon-lid">
        <path d="M3 6h18" />
        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      </g>
      <g className="trash-bin-icon-body">
        <path d="M19 8v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8" />
        <path d="M10 11.5v6" />
        <path d="M14 11.5v6" />
      </g>
    </svg>
  );
}
