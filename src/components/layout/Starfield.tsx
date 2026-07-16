import { useEffect, useRef } from "react";

import { usePreferencesStore } from "@/stores/preferencesStore";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Star = { x: number; y: number; layer: number; r: number; phase: number; twinkleSpeed: number };
type Nebula = { x: number; y: number; radius: number; driftX: number; driftY: number; phase: number; color: string; alpha: number };

// Three parallax depths: distant stars are dim, slow, and small; near stars are
// brighter, faster, and larger. Counts kept modest (~214 total) so the always-
// running canvas stays cheap on WebView2.
const LAYERS = [
  { count: 90, speed: 4, size: 0.65, alpha: 0.55 },
  { count: 80, speed: 9, size: 0.95, alpha: 0.8 },
  { count: 44, speed: 16, size: 1.4, alpha: 1 },
];

const STAR_COLOR = "#eef1ff";

// Soft nebula clouds. Sharp star points blur away to nothing through the
// frosted panels — large gradient clouds are what actually reads as a galaxy
// wash behind the glass. Drawn additively under the stars, drifting slowly.
// Kept monochrome (silver → grey) so the field stays inside the dark theme's
// black/white/grey/silver palette instead of tinting it violet.
const NEBULA_COLORS = ["226, 230, 240", "170, 176, 190", "244, 246, 252", "138, 144, 158"];

/**
 * A drifting silver starfield rendered behind the app for the dark theme only.
 * Guardrails: mounts (and paints) exclusively while dark is active, pauses on
 * tab-hide / window-blur, and freezes to a single static frame under
 * prefers-reduced-motion — so it costs nothing for the light theme and little
 * when the window isn't in focus.
 */
export function Starfield() {
  const resolvedTheme = usePreferencesStore((state) => state.resolvedTheme);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (resolvedTheme !== "dark") {
      return undefined;
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return undefined;
    }

    const reduced = prefersReducedMotion();
    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let nebulae: Nebula[] = [];
    let rafId = 0;
    let running = false;
    let last = 0;

    const build = () => {
      stars = [];
      LAYERS.forEach((layer, layerIndex) => {
        for (let i = 0; i < layer.count; i += 1) {
          stars.push({
            x: Math.random() * width,
            y: Math.random() * height,
            layer: layerIndex,
            r: layer.size * (0.6 + Math.random() * 0.8),
            phase: Math.random() * Math.PI * 2,
            twinkleSpeed: 0.6 + Math.random() * 1.6,
          });
        }
      });

      const span = Math.max(width, height);
      nebulae = NEBULA_COLORS.map((color, index) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: span * (0.32 + Math.random() * 0.22),
        driftX: (Math.random() - 0.5) * 6,
        driftY: (Math.random() - 0.5) * 6,
        phase: Math.random() * Math.PI * 2,
        color,
        alpha: index === 0 ? 0.22 : 0.15,
      }));
    };

    const draw = (deltaMs: number, animate: boolean) => {
      ctx.clearRect(0, 0, width, height);

      // Nebula clouds first, blended additively for a glow that survives the
      // frosted-panel blur.
      ctx.globalCompositeOperation = "lighter";
      for (const nebula of nebulae) {
        if (animate) {
          nebula.x += nebula.driftX * deltaMs * 0.001;
          nebula.y += nebula.driftY * deltaMs * 0.001;
          const margin = nebula.radius;
          if (nebula.x < -margin) nebula.x = width + margin;
          if (nebula.x > width + margin) nebula.x = -margin;
          if (nebula.y < -margin) nebula.y = height + margin;
          if (nebula.y > height + margin) nebula.y = -margin;
          nebula.phase += deltaMs * 0.0004;
        }
        const pulse = 0.82 + Math.sin(nebula.phase) * 0.18;
        const peak = nebula.alpha * pulse;
        const gradient = ctx.createRadialGradient(nebula.x, nebula.y, 0, nebula.x, nebula.y, nebula.radius);
        // A soft multi-stop falloff (not a hard 2-stop) so the large gradient
        // doesn't band into visible concentric rings through the glass.
        gradient.addColorStop(0, `rgba(${nebula.color}, ${peak})`);
        gradient.addColorStop(0.35, `rgba(${nebula.color}, ${peak * 0.52})`);
        gradient.addColorStop(0.65, `rgba(${nebula.color}, ${peak * 0.18})`);
        gradient.addColorStop(1, `rgba(${nebula.color}, 0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(nebula.x - nebula.radius, nebula.y - nebula.radius, nebula.radius * 2, nebula.radius * 2);
      }
      ctx.globalCompositeOperation = "source-over";

      for (const star of stars) {
        const layer = LAYERS[star.layer];
        if (animate) {
          star.x -= layer.speed * deltaMs * 0.001;
          star.y += layer.speed * deltaMs * 0.0006;
          if (star.x < -2) {
            star.x = width + 2;
            star.y = Math.random() * height;
          }
          if (star.y > height + 2) {
            star.y = -2;
            star.x = Math.random() * width;
          }
          star.phase += star.twinkleSpeed * deltaMs * 0.001;
        }
        const twinkle = 0.75 + Math.sin(star.phase) * 0.25;
        ctx.globalAlpha = layer.alpha * twinkle;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = STAR_COLOR;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      if (!running) {
        return;
      }
      const deltaMs = Math.min(now - last, 60);
      last = now;
      draw(deltaMs, true);
      rafId = window.requestAnimationFrame(loop);
    };

    const start = () => {
      if (reduced || running) {
        return;
      }
      running = true;
      last = performance.now();
      rafId = window.requestAnimationFrame(loop);
    };

    const stop = () => {
      running = false;
      window.cancelAnimationFrame(rafId);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      if (reduced) {
        draw(0, false);
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };

    resize();
    if (reduced) {
      draw(0, false);
    } else {
      start();
    }

    // Pause only when the page is truly hidden (window minimized / occluded) —
    // NOT merely unfocused. As an ambient backdrop (and in the always-visible
    // pin widget) the field should keep drifting while another window is active.
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [resolvedTheme]);

  if (resolvedTheme !== "dark") {
    return null;
  }

  return <canvas aria-hidden="true" className="app-starfield" ref={canvasRef} />;
}
