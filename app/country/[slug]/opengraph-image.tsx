import { ImageResponse } from "next/og";
import { COUNTRIES_BY_SLUG } from "@/lib/data/countries";
import { paymentMethodsForCurrency } from "@/lib/data/ads";
import { BRAND, OG_SIZE, flagPlateLetters } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "OpenFiat P2P market";

/*
 * No generateImageMetadata and no generateStaticParams here. Declaring either
 * alongside the other made the build fail to resolve this route at all
 * (PageNotFoundError on /country/[slug]/opengraph-image): an image route under
 * a dynamic segment takes its params from the page's own
 * generateStaticParams, and generateImageMetadata is only for emitting several
 * images from one route, which this does not do.
 */

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const country = COUNTRIES_BY_SLUG.get(slug);

  const name = country?.name ?? "Global";
  const code = country?.currencyCode ?? "";
  const currencyName = country?.currencyName ?? "";
  const methods = country ? paymentMethodsForCurrency(country.currencyCode).slice(0, 3) : [];

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
        {/* A brand rule rather than a logo file: the mark is a raster we would
            have to fetch, and a gradient edge reads as the same brand. */}
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

        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 84,
              height: 84,
              borderRadius: 999,
              background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.teal})`,
              color: "#fff",
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            {country ? flagPlateLetters(country.code) : "OF"}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ color: BRAND.muted, fontSize: 26, letterSpacing: 2 }}>OPENFIAT · P2P</div>
            <div style={{ color: BRAND.faint, fontSize: 24, marginTop: 4 }}>
              {code ? `${currencyName} · ${code}` : currencyName}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: BRAND.text, fontSize: 78, fontWeight: 700, lineHeight: 1.05 }}>
            {`Buy & sell USDT in ${name}`}
          </div>
          <div style={{ color: BRAND.muted, fontSize: 32, marginTop: 20, lineHeight: 1.35 }}>
            Escrow enforced by Solana programs. OpenFiat never takes custody of your fiat.
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
