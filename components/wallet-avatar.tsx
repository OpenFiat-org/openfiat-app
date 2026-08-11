import { placeholderAvatarUri } from "@/lib/placeholder-avatar";

/**
 * The picture beside a wallet, merchant or service provider.
 *
 * # A published avatar wins; the robot only fills a gap
 *
 * `src` is the IPFS URL of an `Avatar` identity claim when the key has
 * published one (`lib/avatar.ts`). When it has not, this draws a robot
 * derived from the key itself — the same robot on every device and every
 * visit, because the drawing is a pure function of the seed and nothing is
 * fetched. See `lib/placeholder-avatar.ts` for why it is generated locally
 * rather than requested from `api.dicebear.com`.
 *
 * # Why the placeholder is marked, and how far that can go
 *
 * A generated robot at full strength reads as a chosen logo, and a merchant
 * who has published nothing would appear to have picked one. So a placeholder
 * is ringed in a dashed border and slightly dimmed, neither of which appears
 * on a real avatar; the alt text and tooltip say the same thing for anyone
 * not going by appearance. The grey circle this replaces was honest about
 * being empty, and that honesty is the part worth keeping.
 *
 * The dimming used to be `opacity-60`, and that was too far. Composited over
 * this app's near-black page it left the whole avatar at 2.3:1 — and it did
 * that on top of a palette that had no contrast to spare (see `CHASSIS_HEX`
 * in `lib/placeholder-avatar.ts`), so in a dense table row the robot was a
 * smudge. An avatar nobody can read is worse than one that reads as chosen,
 * and the dashed ring carries the "not a chosen picture" signal on its own —
 * it is a shape that never appears around a published avatar, so it does not
 * need the dimming's help to be noticed. What is left is enough to feel a
 * difference when the two are side by side, and not enough to hide anything.
 *
 * # The chip is a second, separate fix
 *
 * The work above (#164) made the robot legible against *its own* gradient
 * disc — brand blue to brand teal, per `CHASSIS_HEX`'s doc — but said nothing
 * about the disc's edge against whatever it is laid on top of. In a table row
 * that is `hover:bg-white/[0.03]` over a near-black page: barely a shade
 * different from the row itself, so a small disc sat there with nothing
 * marking where it starts. A P2P order book is exactly the dense, scannable
 * list where that matters most.
 *
 * So every avatar — published or generated — now sits inside a fixed chip: a
 * faint raised background plus a hairline ring, both drawn from the same
 * `white/*` tokens the rest of this app frames things with (`AssetPill`'s
 * `bg-white/10`, `DataTable`'s `border-white/10`), so the frame reads as this
 * app's own chrome rather than a one-off. The chip is sized to `size` and the
 * picture drawn smaller inside it, so a caller reserving `size` pixels of
 * layout for this component — `merchants-directory.tsx`'s
 * `pl-[2.625rem]` alignment under a 32px avatar, for one — keeps working
 * unchanged: only what is drawn inside that box gained a frame, never the
 * box itself.
 */
export function WalletAvatar({
  seed,
  src,
  label,
  size = 40,
  className = "",
}: {
  /**
   * The canonical identity: a base58 wallet address, or a peer id in one
   * consistent encoding. Two spellings of the same key draw two robots, so
   * callers must not pass a shortened or re-cased form.
   */
  seed: string;
  /** A published avatar's URL, when one exists. */
  src?: string | null;
  /** What this picture is of, for `alt` — a name, or a shortened key. */
  label: string;
  size?: number;
  className?: string;
}) {
  // The chip's own border, in pixels — thick enough to read as a ring at
  // every size this component is asked for (22px in a trade list, 80px in
  // the account form) without swallowing a small avatar's picture entirely.
  const border = Math.max(2, Math.round(size * 0.08));
  const picture = size - border * 2;
  const dimensions = { width: picture, height: picture };
  const chip =
    "inline-flex shrink-0 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/10";

  if (src) {
    return (
      <span className={`${chip} ${className}`} style={{ width: size, height: size }}>
        {/*
         * A plain <img>, not next/image, for the same reason as the avatar
         * form: next/image would route the fetch through this app's server to
         * resize it, making our origin fetch and re-serve an image a stranger
         * chose. The browser should go to the gateway directly.
         */}
        <img src={src} alt={label} {...dimensions} className="rounded-full object-cover" />
      </span>
    );
  }

  return (
    <span className={`${chip} ${className}`} style={{ width: size, height: size }}>
      <img
        src={placeholderAvatarUri(seed)}
        alt={`Generated placeholder for ${label} — no avatar published`}
        title={`${label} has not published an avatar. This robot is generated from the key and is not a picture they chose.`}
        {...dimensions}
        className="rounded-full border border-dashed border-white/40 opacity-95"
      />
    </span>
  );
}
