import { ImageResponse } from "next/og";
import { findPair } from "@/lib/pairs";
import { formatNumber } from "@/lib/format";
import { BRAND, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "OpenFiat P2P rate";

/**
 * The card for a pair page. Leads with the rate, because a shared link to
 * "convert USDT to KES" is usually shared *for* the number.
 *
 * No generateImageMetadata or generateStaticParams here — an image route under a
 * dynamic segment takes its params from the page's own, and declaring either
 * breaks route resolution outright.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ asset: string; currency: string }>;
}) {
  const { asset, currency } = await params;
  const pair = findPair(asset, currency);

  const heading = pair
    ? `${pair.asset} → ${pair.currency}`
    : `${asset.toUpperCase()} → ${currency.toUpperCase()}`;
  const rate = pair ? `1 ${pair.asset} = ${formatNumber(pair.rate)} ${pair.currency}` : "";
  const methods = pair ? pair.methods.slice(0, 3) : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BRAND.bg,
          padding: 72,
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

        <div style={{ color: BRAND.muted, fontSize: 26, letterSpacing: 2 }}>
          OPENFIAT · PEER-TO-PEER
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: BRAND.text, fontSize: 96, fontWeight: 700, lineHeight: 1.02 }}>
            {heading}
          </div>
          {rate && (
            <div style={{ color: BRAND.teal, fontSize: 44, marginTop: 18 }}>{rate}</div>
          )}
          <div style={{ color: BRAND.muted, fontSize: 28, marginTop: 18, lineHeight: 1.35 }}>
            Escrow enforced by audited Solana programs. No exchange operator.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {methods.map((m) => (
            <div
              key={m}
              style={{
                display: "flex",
                padding: "10px 20px",
                borderRadius: 8,
                background: BRAND.panel,
                border: `1px solid ${BRAND.line}`,
                color: BRAND.muted,
                fontSize: 26,
              }}
            >
              {m}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
