import qr from "qrcode-generator";

/**
 * A QR code, rendered as one SVG path.
 *
 * The encoder is `qrcode-generator` — zero dependencies, and the arithmetic
 * involved (Galois-field Reed–Solomon, mask scoring, version selection) is not
 * something to hand-roll when the failure mode is a code that looks fine and
 * does not scan. It is the only runtime dependency this app has beyond Next and
 * React, which felt like the right place to spend one.
 *
 * Drawn as a single path rather than a rect per module: a Solana address at
 * error-correction level M is a 33×33 grid, so per-module elements would put
 * roughly a thousand nodes in the tree for one image.
 */
export function QrCode({
  value,
  size = 96,
  className,
}: {
  value: string;
  /** Rendered edge length in px. The grid scales to fit. */
  size?: number;
  className?: string;
}) {
  // Type 0 lets the encoder pick the smallest version that fits. Level M
  // tolerates ~15% damage, which is the usual choice for an address printed or
  // shown on a screen someone photographs at an angle.
  const code = qr(0, "M");
  code.addData(value);
  code.make();

  const count = code.getModuleCount();
  // One module of quiet zone on each side. The spec asks for four, but this is
  // rendered on a contrasting plate rather than against arbitrary content, and
  // four would shrink the payload area noticeably at this size.
  const quiet = 1;
  const span = count + quiet * 2;

  let path = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (code.isDark(row, col)) {
        path += `M${col + quiet} ${row + quiet}h1v1h-1z`;
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${span} ${span}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code for ${value}`}
      className={className}
    >
      <rect width={span} height={span} fill="#ffffff" />
      <path d={path} fill="#0a0e14" />
    </svg>
  );
}
