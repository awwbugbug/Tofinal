import { usePreferencesStore } from "@/stores/preferencesStore";

/**
 * The light theme's backdrop: two counter-rotating, heavily blurred conic
 * gradients that drift pastel light behind the glass panels.
 *
 * It is the light-theme counterpart to the dark theme's Starfield, and it earns
 * its keep twice over — it is the thing the frosted panels actually have to
 * blur. Over a flat gradient, "blurred gradient" looks like the gradient; over
 * this, the glass picks up real colour and movement.
 *
 * Cheap despite the huge blur: the gradients themselves never change, only a
 * transform animates, so the blurred layers rasterise once and the compositor
 * just rotates the cached textures. All the CSS lives in globals.css
 * (.aurora-backdrop), which also freezes it under prefers-reduced-motion.
 */
export function AuroraBackdrop() {
  const resolvedTheme = usePreferencesStore((state) => state.resolvedTheme);

  if (resolvedTheme !== "light") {
    return null;
  }

  return <div aria-hidden="true" className="aurora-backdrop" />;
}
