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
 *
 * # Render this as a direct child of `main`, never inside a narrower column
 *
 * The band is full-bleed by escaping its parent: `w-screen` with `left-1/2
 * -translate-x-1/2`. That arithmetic assumes the parent's centre is the
 * viewport's centre, which is true of `app/layout.tsx`'s centred `main` and
 * of nothing else. Put it inside a `max-w-3xl` reading column and it centres
 * on that column instead — 240px off to the left at desktop width, taking the
 * title off the edge of the screen with it. `body { overflow-x: clip }` keeps
 * that from producing a scrollbar, so the only symptom is a missing heading,
 * which is why it survived on two pages. A page wanting a narrow column puts
 * the column *after* the hero rather than around it.
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
      // Was w/16 capped at 90, which on a wide band produced a solid web of
      // links rather than a network you can read the shape of.
      const count = Math.min(44, Math.max(14, Math.floor(w / 30)));
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
            ctx.strokeStyle = BLUE((1 - Math.sqrt(d2) / 130) * 0.13);
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        const md2 = (a.x - mouse.x) ** 2 + (a.y - mouse.y) ** 2;
        if (md2 < 160 * 160) {
          ctx.strokeStyle = TEAL((1 - Math.sqrt(md2) / 160) * 0.3);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        }
      }
      ctx.fillStyle = BLUE_LIGHT(0.4);
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

/**
 * Dotted rotating wireframe globe (hand-rolled 2D projection), with orbit
 * arcs that run past both band edges.
 *
 * The globe is sized off the band height rather than min(w, h): on a hero
 * that is ~240px tall and 1440px wide, min() picks the height anyway and then
 * halves it, which left a small disc floating in an otherwise empty band. The
 * arcs are what actually span the width — a globe alone cannot, without
 * overflowing vertically.
 */
function globeScene(ctx: Ctx): Scene {
  let w = 0, h = 0;
  let pts: Array<[number, number, number]> = [];
  return {
    resize(nw, nh) {
      w = nw; h = nh;
      const n = 320;
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
      const R = h * 0.6;
      const cx = w * 0.72, cy = h * 0.5;
      const rot = t * 0.25;
      const cosR = Math.cos(rot), sinR = Math.sin(rot);

      // Orbit arcs. Radii are multiples of the full width, so each one enters
      // at one edge and leaves at the other rather than closing inside view.
      for (let k = 0; k < 4; k++) {
        const rx = w * (0.34 + k * 0.22);
        const ry = h * (0.5 + k * 0.28);
        const tilt = -0.22 + k * 0.1 + Math.sin(t * 0.12 + k) * 0.03;
        ctx.strokeStyle = k % 2 ? TEAL(0.07) : BLUE(0.09);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, tilt, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Travelling markers along the arcs, so the width reads as motion.
      for (let k = 0; k < 4; k++) {
        const rx = w * (0.34 + k * 0.22);
        const ry = h * (0.5 + k * 0.28);
        const tilt = -0.22 + k * 0.1;
        const a = t * (0.3 - k * 0.05) + k * 1.7;
        const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
        const px = cx + ex * Math.cos(tilt) - ey * Math.sin(tilt);
        const py = cy + ex * Math.sin(tilt) + ey * Math.cos(tilt);
        ctx.fillStyle = k % 2 ? TEAL(0.5) : BLUE_LIGHT(0.5);
        ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      }

      // Faint latitude rings on the globe itself.
      for (const lat of [-0.5, 0, 0.5]) {
        const rr = R * Math.sqrt(1 - lat * lat);
        ctx.strokeStyle = BLUE(0.07);
        ctx.beginPath();
        ctx.ellipse(cx, cy + R * lat, rr, rr * 0.28, 0, 0, Math.PI * 2);
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
    // Was w/46 with a 26px tick pitch — dozens of columns of dashes
    // reading as confetti across the whole band.
    resize(nw, nh) { w = nw; h = nh; cols = Math.max(4, Math.floor(w / 108)); },
    frame(t) {
      ctx.clearRect(0, 0, w, h);
      const spacing = 44;
      for (let i = 0; i < cols; i++) {
        const x = i * 108 + 40;
        const up = i % 3 !== 0;
        const offset = ((up ? t * 22 : -t * 22) + i * 37) % spacing;
        for (let y = -spacing; y < h + spacing; y += spacing) {
          const yy = y + (up ? offset : -offset) + spacing;
          if (yy < 0 || yy > h) continue;
          const teal = (i + Math.round(y / spacing)) % 5 === 0;
          ctx.strokeStyle = teal ? TEAL(0.13) : BLUE(0.1);
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

/**
 * Beacons — concentric expanding rings from fixed points.
 *
 * Five beacons rather than three, spread to both edges, with a ring radius
 * scaled off the width so they overlap instead of sitting as three isolated
 * targets in a wide band.
 */
function pulseScene(ctx: Ctx): Scene {
  let w = 0, h = 0;
  return {
    resize(nw, nh) { w = nw; h = nh; },
    frame(t) {
      ctx.clearRect(0, 0, w, h);
      const points: Array<[number, number, boolean]> = [
        [w * 0.04, h * 0.5, false],
        [w * 0.24, h * 0.66, true],
        [w * 0.46, h * 0.32, false],
        [w * 0.68, h * 0.7, true],
        [w * 0.92, h * 0.42, false],
      ];
      const maxR = Math.max(120, w * 0.14);
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

/**
 * Arbitration scales — a slow balance beam swinging around a pivot, with the
 * evidence rules running out to both band edges.
 *
 * The beam is a fraction of the width, not of min(w, h): the latter pinned it
 * to roughly 130px on a 1440px band, leaving the scales marooned in the
 * middle. The horizontal rules carry the rest of the width.
 */
function scalesScene(ctx: Ctx): Scene {
  let w = 0, h = 0;
  return {
    resize(nw, nh) { w = nw; h = nh; },
    frame(t) {
      ctx.clearRect(0, 0, w, h);
      const cx = w * 0.5, cy = h * 0.30;
      const L = Math.min(w * 0.46, h * 3.2);

      // Evidence rules: hairlines the full width of the band, densest near
      // the beam, so the composition reaches the edges.
      for (let k = 0; k < 5; k++) {
        const y = h * (0.62 + k * 0.085);
        ctx.strokeStyle = k % 2 ? TEAL(0.05) : BLUE(0.07);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        // A single mark sliding along each rule.
        const px = ((t * (14 + k * 6) + k * 260) % (w + 120)) - 60;
        ctx.fillStyle = k % 2 ? TEAL(0.35) : BLUE_LIGHT(0.32);
        ctx.fillRect(px, y - 1.5, 14, 3);
      }
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

/**
 * Ballot — a few tallies filling toward a quorum line.
 *
 * Was sixteen bars oscillating on independent sine phases along the bottom of
 * the band, which is exactly where the metric strip sits: chunky rectangles
 * pumping up and down behind the numbers. It read as noise because it was
 * noise — sixteen unrelated oscillators say nothing about voting.
 *
 * Four horizontal tallies now fill slowly toward a quorum marker and hold
 * there, which is what a vote actually looks like, and they sit in the upper
 * band away from the text.
 */
function ballotScene(ctx: Ctx): Scene {
  let w = 0, h = 0;
  return {
    resize(nw, nh) { w = nw; h = nh; },
    frame(t) {
      ctx.clearRect(0, 0, w, h);
      const rows = 4;
      const quorum = w * 0.74;

      // Quorum line: the threshold every tally is measured against.
      ctx.strokeStyle = BLUE(0.1);
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(quorum, h * 0.16);
      ctx.lineTo(quorum, h * 0.84);
      ctx.stroke();
      ctx.setLineDash([]);

      for (let i = 0; i < rows; i++) {
        const y = h * (0.28 + (i * 0.16));
        // Each tally eases toward its own share and settles, rather than
        // oscillating forever. Periods are long and mutually prime-ish so they
        // do not visibly loop together.
        const target = 0.45 + i * 0.14;
        const progress = Math.min(1, (t % (26 + i * 5)) / (9 + i * 2));
        const eased = 1 - (1 - progress) ** 3;
        const x1 = w * 0.18;
        const x2 = x1 + (quorum - x1) * target * eased * 1.25;

        ctx.strokeStyle = i % 2 ? TEAL(0.1) : BLUE(0.12);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(Math.min(x2, w), y);
        ctx.stroke();

        // Track behind the tally, so an unfilled row still reads as a row.
        ctx.strokeStyle = BLUE(0.04);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(w * 0.94, y);
        ctx.stroke();
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

  /*
   * Faded out under the reading column.
   *
   * Every scene drew at full strength across the whole band, so the headline,
   * description and metric strip all sat on top of moving geometry — legible,
   * but restless to read. The mask keeps the animation where there is nothing
   * to read (the right of the band) and removes it where there is. It applies
   * to all variants at once, which is the right level to fix this at: the
   * problem was never one scene's design, it was every scene competing with
   * the text.
   */
  const fade =
    "linear-gradient(to right, transparent 0%, transparent 26%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.85) 74%, #000 100%)";

  return (
    <canvas
      ref={ref}
      data-variant={variant}
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ maskImage: fade, WebkitMaskImage: fade }}
      aria-hidden
    />
  );
}
