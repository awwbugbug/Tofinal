import { type ElementType, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type GlassSurfaceProps = {
  /** Semantic element for the outer shell (default div). */
  as?: ElementType;
  /** Outer shell classes: sizing, rounded corners, grid/flex placement. */
  className?: string;
  /** Inner content classes: padding and the panel's own layout. */
  contentClassName?: string;
  children: ReactNode;
} & Record<string, unknown>;

/**
 * Apple-style Liquid Glass surface. Three stacked layers:
 *  - outer shell: rounded clip + edge stroke + inner/outer shadow only;
 *  - `__pane`: the actual glass — backdrop blur/saturate plus soft overlapping
 *    radial light sources. Its clip comes from the shell's overflow, so blur
 *    and overflow never share a layer (avoids corner aliasing).
 *
 * The blurred layers are SIBLINGS of the content, and the content wrapper is
 * position:relative WITHOUT a z-index — so it is not a stacking context and any
 * position:fixed modal/popover rendered inside (preferences, date/time
 * popovers) still escapes to the viewport instead of being trapped in the
 * column.
 */
export function GlassSurface({ as, className, contentClassName, children, ...rest }: GlassSurfaceProps) {
  const Tag = (as ?? "div") as ElementType;

  return (
    <Tag className={cn("liquid-glass", className)} {...rest}>
      <span aria-hidden="true" className="liquid-glass__pane" />
      <div className={cn("liquid-glass__content", contentClassName)}>{children}</div>
    </Tag>
  );
}
