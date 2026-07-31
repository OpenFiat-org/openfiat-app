import { ImageResponse } from "next/og";
import { formatNumber } from "@/lib/format";
import { BRAND, OG_SIZE } from "@/lib/og";
import { normalisePair } from "@/lib/pairs";
import { loadPairData } from "./pair-data";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "OpenFiat P2P rate";

/**
 * The card for a pair page. Leads with the rate, because a shared link to
 * "convert USDT to KES" is usually shared *for* the number.
 *
 * Which makes this the most damaging place the fixture reached: the card is
 * what travels into other people's timelines, where nobody can see the page
 * to check it. It printed a hand-written rate from `ORACLE_MID`, so the
 * number most likely to be read was the one nothing had ever measured.
 *
 * It now reads the same live median the page does, and prints no rate at all
 * when there is not one — a card with a heading and no figure is a card that
 * has not said anything false. The payment rails come from advertisements
 * that actually exist rather than from a markets fixture, which is why an
 * empty corridor shows none.
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
  const pair = await normalisePair(asset, currency);

  const heading = pair
    ? `${pair.asset} → ${pair.currency}`
    : `${asset.toUpperCase()} → ${currency.toUpperCase()}`;

  const data = pair ? await loadPairData(pair) : null;
  const rate =
    pair && data?.rate.kind === "current"
      ? `1 ${pair.asset} = ${formatNumber(data.rate.rate)} ${pair.currency}`
      : "";
  const methods = data ? data.methods.slice(0, 3) : [];

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
            Escrow enforced by Solana programs. No exchange operator.
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
