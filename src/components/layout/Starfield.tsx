import { useEffect, useRef } from "react";

import { usePreferencesStore } from "@/stores/preferencesStore";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Star = { x: number; y: number; layer: number; r: number; phase: number; twinkleSpeed: number };
type Nebula = { x: number; y: number; radius: number; driftX: number; driftY: number; phase: number; sprite: HTMLCanvasElement; alpha: number };

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

// The backdrop drifts slowly, so it does not need 60fps — and every frame it
// paints also forces each glass panel to recompute its backdrop blur, so
// halving the rate roughly halves the whole backdrop cost.
const FRAME_MS = 1000 / 30;

// Nebulae are huge, soft gradients: rasterise each ONCE into a small sprite and
// scale it up at draw time (upscaling is invisible on something this blurry).
// Rebuilding real radial gradients every frame was the expensive part.
const NEBULA_SPRITE_SIZE = 192;

// The sun: one warm star burning in the top-right corner. It is the single
// colour in an otherwise black/grey/silver sky, and it is what the frosted
// panels bloom — a big soft gradient is exactly what survives a 24px blur.
// Anchored proportionally so it stays in the corner at any window size.
const SUN_SPRITE_SIZE = 256;
const SUN_ANCHOR_X = 0.94;
const SUN_ANCHOR_Y = 0.04;
const SUN_RADIUS_RATIO = 0.46;
// Radians/second. ~0.7 gives a ~9s cycle: a slow, deep breath you can actually
// perceive. Much slower than this and the pulse is imperceptible rather than
// calm — the first pass ran a 39s cycle, which read as "not breathing at all".
const SUN_BREATH_SPEED = 0.7;

const makeSunSprite = () => {
  const sprite = document.createElement("canvas");
  sprite.width = SUN_SPRITE_SIZE;
  sprite.height = SUN_SPRITE_SIZE;
  const sctx = sprite.getContext("2d");
  if (!sctx) {
    return sprite;
  }
  const mid = SUN_SPRITE_SIZE / 2;
  const gradient = sctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
  // White-hot core → yellow → amber → a long warm falloff that fades to
  // nothing, so it reads as light rather than a pasted-on disc.
  gradient.addColorStop(0, "rgba(255, 252, 232, 1)");
  gradient.addColorStop(0.05, "rgba(255, 243, 184, 0.94)");
  gradient.addColorStop(0.14, "rgba(255, 215, 118, 0.6)");
  gradient.addColorStop(0.34, "rgba(255, 170, 74, 0.24)");
  gradient.addColorStop(0.62, "rgba(255, 142, 56, 0.08)");
  gradient.addColorStop(1, "rgba(255, 130, 50, 0)");
  sctx.fillStyle = gradient;
  sctx.fillRect(0, 0, SUN_SPRITE_SIZE, SUN_SPRITE_SIZE);
  return sprite;
};

const makeNebulaSprite = (color: string) => {
  const sprite = document.createElement("canvas");
  sprite.width = NEBULA_SPRITE_SIZE;
  sprite.height = NEBULA_SPRITE_SIZE;
  const sctx = sprite.getContext("2d");
  if (!sctx) {
    return sprite;
  }
  const mid = NEBULA_SPRITE_SIZE / 2;
  const gradient = sctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
  // A soft multi-stop falloff (not a hard 2-stop) so the large gradient doesn't
  // band into visible concentric rings through the glass. Baked at full alpha;
  // the per-frame pulse is applied with globalAlpha.
  gradient.addColorStop(0, `rgba(${color}, 1)`);
  gradient.addColorStop(0.35, `rgba(${color}, 0.52)`);
  gradient.addColorStop(0.65, `rgba(${color}, 0.18)`);
  gradient.addColorStop(1, `rgba(${color}, 0)`);
  sctx.fillStyle = gradient;
  sctx.fillRect(0, 0, NEBULA_SPRITE_SIZE, NEBULA_SPRITE_SIZE);
  return sprite;
};

/**
 * A drifting silver starfield rendered behind the app for the dark theme only.
 * Guardrails: mounts (and paints) exclusively while dark is active, runs at
 * 30fps, pauses on tab-hide, and freezes to a single static frame under
 * prefers-reduced-motion — so it costs nothing for the light theme and little
 * when the window isn't visible.
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
    const sprites = NEBULA_COLORS.map(makeNebulaSprite);
    const sunSprite = makeSunSprite();
    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let nebulae: Nebula[] = [];
    let sunPhase = Math.random() * Math.PI * 2;
    let rafId = 0;
    let resizeRaf = 0;
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
      nebulae = sprites.map((sprite, index) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: span * (0.32 + Math.random() * 0.22),
        driftX: (Math.random() - 0.5) * 6,
        driftY: (Math.random() - 0.5) * 6,
        phase: Math.random() * Math.PI * 2,
        sprite,
        alpha: index === 0 ? 0.22 : 0.15,
      }));
    };

    const draw = (deltaMs: number, animate: boolean) => {
      ctx.clearRect(0, 0, width, height);

      // Everything luminous is blended additively so it reads as light rather
      // than paint — and so it blooms through the panels' blur.
      ctx.globalCompositeOperation = "lighter";

      // The sun, breathing in the corner. BRIGHTNESS is what actually reads as
      // breathing — swelling a huge soft gradient a few percent is invisible on
      // its own — so the halo dims and flares roughly 2x while it also swells.
      if (animate) {
        sunPhase += SUN_BREATH_SPEED * deltaMs * 0.001;
      }
      const breath = Math.sin(sunPhase) * 0.5 + 0.5; // 0..1
      const sunRadius = Math.max(width, height) * SUN_RADIUS_RATIO * (0.8 + breath * 0.3);
      ctx.globalAlpha = 0.5 + breath * 0.5;
      ctx.drawImage(
        sunSprite,
        width * SUN_ANCHOR_X - sunRadius,
        height * SUN_ANCHOR_Y - sunRadius,
        sunRadius * 2,
        sunRadius * 2,
      );

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
        ctx.globalAlpha = nebula.alpha * pulse;
        const size = nebula.radius * 2;
        ctx.drawImage(nebula.sprite, nebula.x - nebula.radius, nebula.y - nebula.radius, size, size);
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
      rafId = window.requestAnimationFrame(loop);
      const elapsed = now - last;
      if (elapsed < FRAME_MS) {
        return;
      }
      last = now - (elapsed % FRAME_MS);
      draw(Math.min(elapsed, 60), true);
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

    const applySize = () => {
      const nextWidth = canvas.clientWidth;
      const nextHeight = canvas.clientHeight;
      if (nextWidth === 0 || nextHeight === 0 || (nextWidth === width && nextHeight === height)) {
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const previousWidth = width;
      const previousHeight = height;
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (stars.length === 0) {
        build();
      } else {
        // Rescale the EXISTING field instead of rebuilding it. Regenerating on
        // every resize event re-randomised every star and cloud, so dragging the
        // window edge scrambled the whole sky dozens of times a second.
        //
        // Only the stars are rescaled: they are sub-pixel points, so nudging
        // them is invisible. The nebulae are LIGHT SOURCES — moving or resizing
        // those on every resize event made the glow visibly jump, which read as
        // strobing. They drift and wrap on their own, so leaving them alone
        // costs nothing. (The sun is anchored proportionally at draw time, so it
        // tracks the corner smoothly rather than being repositioned here.)
        const scaleX = width / previousWidth;
        const scaleY = height / previousHeight;
        for (const star of stars) {
          star.x *= scaleX;
          star.y *= scaleY;
        }
      }

      // Setting canvas.width above CLEARS the bitmap. Repaint NOW rather than
      // waiting up to a frame interval for the throttled loop — otherwise every
      // resize event left a blank canvas on screen and the backdrop strobed.
      draw(0, false);
    };

    // Coalesce resize bursts into one measurement per frame.
    const onResize = () => {
      if (resizeRaf !== 0) {
        return;
      }
      resizeRaf = window.requestAnimationFrame(() => {
        resizeRaf = 0;
        applySize();
      });
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };

    applySize();
    if (reduced) {
      draw(0, false);
    } else {
      start();
    }

    // Pause only when the page is truly hidden (window minimized / occluded) —
    // NOT merely unfocused. As an ambient backdrop (and in the always-visible
    // pin widget) the field should keep drifting while another window is active.
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    observer?.observe(canvas);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      if (resizeRaf !== 0) {
        window.cancelAnimationFrame(resizeRaf);
      }
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [resolvedTheme]);

  if (resolvedTheme !== "dark") {
    return null;
  }

  return <canvas aria-hidden="true" className="app-starfield" ref={canvasRef} />;
}
