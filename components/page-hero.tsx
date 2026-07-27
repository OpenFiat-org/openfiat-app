"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Reusable page hero: large title + one-line description + optional right-side
 * slot, over a hand-rolled Canvas 2D animation in the brand palette (blue
 * #0070f8 → teal #00b098, low opacity on the dark bg). Variants are distinct
 * per page — see HeroCanvas. Engineering discipline shared by all variants:
 * rAF + cleanup, DPR-aware resize, capped particle counts, static single
 * frame under prefers-reduced-motion, client-only painting (no SSR/hydration
 * concerns).
 */
export type HeroVariant =
  | "mesh"
  | "flow"
  | "flow-rev"
  | "globe"
  | "ledger"
  | "pulse"
  | "scales"
  | "bloom"
  | "ballot";

export function PageHero({
  title,
  description,
  variant = "mesh",
  compact = false,
  children,
  below,
}: {
  title: ReactNode;
  description?: string;
  /** Animation variant — each page gets its own (see HeroCanvas scenes). */
  variant?: HeroVariant;
  /** Compact variant for working surfaces like the exchange landing. */
  compact?: boolean;
  /** Optional right-side slot (actions, metric strip). */
  children?: ReactNode;
  /** Optional full-width slot under the title row (e.g. a search bar). */
  below?: ReactNode;
}) {
  return (
    <div
      className={`relative -mt-8 w-screen overflow-hidden border-b border-white/10 left-1/2 -translate-x-1/2 ${
        compact ? "py-10" : "py-16"
      }`}
    >
      <HeroCanvas variant={variant} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_30%_20%,rgba(0,112,248,0.10),transparent_70%)]" />
      <div className="relative z-10 mx-auto max-w-7xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <h1 className={`font-semibold tracking-tight text-white ${compact ? "text-2xl" : "text-3xl"}`}>{title}</h1>
            {description && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-400">{description}</p>}
          </div>
          {children}
        </div>
        {below && <div className="mt-8">{below}</div>}
      </div>
    </div>
  );
}

// ── Canvas scenes ─────────────────────────────────────────────────────────────

const BLUE = (a: number) => `rgba(0, 112, 248, ${a})`;
const BLUE_LIGHT = (a: number) => `rgba(43, 143, 255, ${a})`;
const TEAL = (a: number) => `rgba(0, 176, 152, ${a})`;

interface Mouse {
  x: number;
  y: number;
}

interface Scene {
  resize(w: number, h: number): void;
  /** t in seconds since mount. */
  frame(t: number): void;
}

type Ctx = CanvasRenderingContext2D;

/** Deterministic PRNG for scene layouts (mulberry32). */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Network mesh — drifting particles, hairline links, pointer-reactive. */
function meshScene(ctx: Ctx, mouse: Mouse): Scene {
  let w = 0, h = 0;
  let pts: Array<{ x: number; y: number; vx: number; vy: number }> = [];
  return {
    resize(nw, nh) {
      w = nw; h = nh;
      const count = Math.min(90, Math.max(24, Math.floor(w / 16)));
      const rand = rng(11);
      pts = Array.from({ length: count }, () => ({
        x: rand() * w, y: rand() * h, vx: (rand() - 0.5) * 0.3, vy: (rand() - 0.5) * 0.3,
      }));
    },
    frame() {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < 120 * 120) {
          const d = Math.sqrt(d2);
          p.x += (dx / d) * 0.5; p.y += (dy / d) * 0.5;
        }
      }
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j];
          const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
          if (d2 < 130 * 130) {
            ctx.strokeStyle = BLUE((1 - Math.sqrt(d2) / 130) * 0.22);
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        const md2 = (a.x - mouse.x) ** 2 + (a.y - mouse.y) ** 2;
        if (md2 < 160 * 160) {
          ctx.strokeStyle = TEAL((1 - Math.sqrt(md2) / 160) * 0.3);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        }
      }
      ctx.fillStyle = BLUE_LIGHT(0.55);
      for (const p of pts) ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    },
  };
}

/** Currency streamlines — horizontal flowing sine waves (dir ±1). */
function flowScene(ctx: Ctx, dir: 1 | -1): Scene {
  let w = 0, h = 0;
  return {
    resize(nw, nh) { w = nw; h = nh; },
    frame(t) {
      ctx.clearRect(0, 0, w, h);
      const lines = 7;
      for (let k = 0; k < lines; k++) {
        const y0 = h * (0.15 + (0.7 * k) / lines);
        const teal = k % 2 === 1;
        ctx.strokeStyle = teal ? TEAL(0.14) : BLUE(0.15);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = -10; x <= w + 10; x += 10) {
          const y =
            y0 +
            Math.sin(x * 0.008 + dir * t * 0.9 + k * 1.3) * 16 +
            Math.sin(x * 0.021 - dir * t * 0.5) * 5;
          if (x === -10) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    },
  };
}

/** Dotted rotating wireframe globe (hand-rolled 2D projection). */
function globeScene(ctx: Ctx): Scene {
  let w = 0, h = 0;
  let pts: Array<[number, number, number]> = [];
  return {
    resize(nw, nh) {
      w = nw; h = nh;
      const n = 260;
      pts = [];
      for (let i = 0; i < n; i++) {
        const y = 1 - (i / (n - 1)) * 2; // fibonacci sphere
        const r = Math.sqrt(1 - y * y);
        const theta = i * 2.399963;
        pts.push([Math.cos(theta) * r, y, Math.sin(theta) * r]);
      }
    },
    frame(t) {
      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w, h) * 0.42;
      const cx = w * 0.72, cy = h * 0.52;
      const rot = t * 0.25;
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      // faint latitude rings
      for (const lat of [-0.5, 0, 0.5]) {
        ctx.strokeStyle = BLUE(0.07);
        ctx.beginPath();
        ctx.ellipse(cx, cy + R * lat, R * Math.sqrt(1 - lat * lat), R * Math.sqrt(1 - lat * lat) * 0.28, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const [x0, y0, z0] of pts) {
        const x = x0 * cosR + z0 * sinR;
        const z = -x0 * sinR + z0 * cosR;
        const alpha = 0.12 + ((z + 1) / 2) * 0.3;
        ctx.fillStyle = z > 0.2 ? TEAL(alpha) : BLUE_LIGHT(alpha);
        ctx.fillRect(cx + R * x - 1, cy + R * y0 - 1, 2, 2);
      }
    },
  };
}

/** Ticker ledger — vertical columns of rising tick marks. */
function ledgerScene(ctx: Ctx): Scene {
  let w = 0, h = 0, cols = 0;
  return {
    resize(nw, nh) { w = nw; h = nh; cols = Math.max(6, Math.floor(w / 46)); },
    frame(t) {
      ctx.clearRect(0, 0, w, h);
      const spacing = 26;
      for (let i = 0; i < cols; i++) {
        const x = i * 46 + 22;
        const up = i % 3 !== 0;
        const offset = ((up ? t * 22 : -t * 22) + i * 37) % spacing;
        for (let y = -spacing; y < h + spacing; y += spacing) {
          const yy = y + (up ? offset : -offset) + spacing;
          if (yy < 0 || yy > h) continue;
          const teal = (i + Math.round(y / spacing)) % 5 === 0;
          ctx.strokeStyle = teal ? TEAL(0.22) : BLUE(0.16);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, yy);
          ctx.lineTo(x + 10, yy);
          ctx.stroke();
        }
      }
    },
  };
}

/** Beacons — concentric expanding rings from fixed points. */
function pulseScene(ctx: Ctx): Scene {
  let w = 0, h = 0;
  return {
    resize(nw, nh) { w = nw; h = nh; },
    frame(t) {
      ctx.clearRect(0, 0, w, h);
      const points: Array<[number, number, boolean]> = [
        [w * 0.22, h * 0.62, false],
        [w * 0.55, h * 0.34, true],
        [w * 0.82, h * 0.66, false],
      ];
      const maxR = 120;
      for (const [px, py, teal] of points) {
        ctx.fillStyle = teal ? TEAL(0.4) : BLUE_LIGHT(0.4);
        ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
        for (let r = 0; r < 3; r++) {
          const rad = (t * 26 + r * (maxR / 3)) % maxR;
          const alpha = (1 - rad / maxR) * 0.22;
          ctx.strokeStyle = teal ? TEAL(alpha) : BLUE(alpha);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    },
  };
}

/** Arbitration scales — a slow balance beam swinging around a pivot. */
function scalesScene(ctx: Ctx): Scene {
  let w = 0, h = 0;
  return {
    resize(nw, nh) { w = nw; h = nh; },
    frame(t) {
      ctx.clearRect(0, 0, w, h);
      const cx = w * 0.5, cy = h * 0.30;
      const L = Math.min(w, h) * 0.55;
      const a = Math.sin(t * 0.55) * 0.10;
      const lx = cx - (L / 2) * Math.cos(a), ly = cy - (L / 2) * Math.sin(a);
      const rx = cx + (L / 2) * Math.cos(a), ry = cy + (L / 2) * Math.sin(a);
      // pivot + arc trail
      ctx.strokeStyle = BLUE(0.12);
      ctx.beginPath();
      ctx.arc(cx, cy, 26, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
      ctx.stroke();
      ctx.fillStyle = BLUE_LIGHT(0.4);
      ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
      // beam
      ctx.strokeStyle = BLUE_LIGHT(0.28);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(rx, ry); ctx.stroke();
      // pans
      for (const [ex, ey, teal] of [[lx, ly, false], [rx, ry, true]] as const) {
        const dy = 34;
        ctx.strokeStyle = (teal ? TEAL : BLUE)(0.22);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex, ey + dy); ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex, ey + dy + 6, 12, 0, Math.PI);
        ctx.stroke();
      }
    },
  };
}

/** Accrual bloom — gently growing branches revealed over time. */
function bloomScene(ctx: Ctx): Scene {
  let w = 0, h = 0;
  let segs: Array<{ x1: number; y1: number; x2: number; y2: number; birth: number; teal: boolean }> = [];
  return {
    resize(nw, nh) {
      w = nw; h = nh;
      const rand = rng(7);
      segs = [];
      const trees = 9;
      for (let i = 0; i < trees; i++) {
        const grow = (x: number, y: number, angle: number, len: number, depth: number, birth: number) => {
          if (depth > 5 || len < 6) return;
          const x2 = x + Math.cos(angle) * len;
          const y2 = y + Math.sin(angle) * len;
          segs.push({ x1: x, y1: y, x2, y2, birth, teal: depth % 2 === 1 });
          const b2 = birth + 0.55 + rand() * 0.3;
          grow(x2, y2, angle - 0.25 - rand() * 0.35, len * 0.72, depth + 1, b2);
          grow(x2, y2, angle + 0.25 + rand() * 0.35, len * 0.72, depth + 1, b2 + 0.1);
        };
        grow(w * (0.08 + (0.84 * i) / trees), h + 4, -Math.PI / 2 + (rand() - 0.5) * 0.4, h * 0.16, 0, i * 0.25);
      }
    },
    frame(t) {
      ctx.clearRect(0, 0, w, h);
      const progress = t * 0.5;
      ctx.lineWidth = 1;
      for (const s of segs) {
        if (progress < s.birth) continue;
        const alpha = Math.min(0.26, (progress - s.birth) * 0.4);
        ctx.strokeStyle = s.teal ? TEAL(alpha) : BLUE(alpha);
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
      }
    },
  };
}

/** Ballot — slowly rising/falling result bars. */
function ballotScene(ctx: Ctx): Scene {
  let w = 0, h = 0;
  return {
    resize(nw, nh) { w = nw; h = nh; },
    frame(t) {
      ctx.clearRect(0, 0, w, h);
      const n = 16;
      const bw = w / (n * 2);
      for (let i = 0; i < n; i++) {
        const frac = i / (n - 1);
        const bh = h * 0.12 + h * 0.14 * (1 + Math.sin(t * 0.6 + i * 0.85)) / 2;
        // blue → teal lerp across the row
        const r = Math.round(0 + 0 * frac);
        const g = Math.round(112 + (176 - 112) * frac);
        const b = Math.round(248 + (152 - 248) * frac);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.13)`;
        ctx.fillRect(i * 2 * bw + bw * 0.5, h - bh, bw, bh);
      }
    },
  };
}

function createScene(variant: HeroVariant, ctx: Ctx, mouse: Mouse): Scene {
  switch (variant) {
    case "flow": return flowScene(ctx, 1);
    case "flow-rev": return flowScene(ctx, -1);
    case "globe": return globeScene(ctx);
    case "ledger": return ledgerScene(ctx);
    case "pulse": return pulseScene(ctx);
    case "scales": return scalesScene(ctx);
    case "bloom": return bloomScene(ctx);
    case "ballot": return ballotScene(ctx);
    default: return meshScene(ctx, mouse);
  }
}

function HeroCanvas({ variant }: { variant: HeroVariant }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = ref.current;
    if (!canvasEl) return;
    const context = canvasEl.getContext("2d");
    if (!context) return;
    const canvas = canvasEl;
    const ctx = context;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const mouse: Mouse = { x: -9999, y: -9999 };
    const scene = createScene(variant, ctx, mouse);
    const t0 = performance.now();
    let raf = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene.resize(rect.width, rect.height);
      if (reduced) scene.frame(2.5); // static mid-state frame
    }

    function loop() {
      scene.frame((performance.now() - t0) / 1000);
      raf = requestAnimationFrame(loop);
    }

    function onMove(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    }

    function onLeave() {
      mouse.x = -9999;
      mouse.y = -9999;
    }

    resize();
    if (!reduced) loop();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [variant]);

  return (
    <canvas
      ref={ref}
      data-variant={variant}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}
