import { ImageResponse } from "next/og";
import { BRAND, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "OpenFiat — decentralized P2P stablecoin exchange";

/** The site-wide card, inherited by every route without its own. */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: BRAND.bg,
          padding: 88,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 8,
            background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.teal})`,
          }}
        />
        <div style={{ color: BRAND.muted, fontSize: 28, letterSpacing: 3 }}>OPENFIAT</div>
        <div
          style={{
            color: BRAND.text,
            fontSize: 88,
            fontWeight: 700,
            lineHeight: 1.05,
            marginTop: 20,
          }}
        >
          Stablecoins for local currency, peer to peer
        </div>
        <div style={{ color: BRAND.muted, fontSize: 34, marginTop: 28, lineHeight: 1.35 }}>
          No exchange operator. Escrow enforced by Solana programs; disputes decided by staked arbitrators.
        </div>
      </div>
    ),
    size,
  );
}
