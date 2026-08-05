import { ImageResponse } from "next/og";

import { countryBySlug } from "@/lib/countries";
import { referenceForRender } from "@/lib/server-reference";
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
  /*
   * The country comes from the node, like everywhere else. A node that
   * cannot be reached leaves `country` undefined, and the card falls back to
   * the global wording below — which is the one honest thing an OpenGraph
   * image can do, since it has no state in which to say "could not load".
   */
  const reference = await referenceForRender();
  const country = reference ? countryBySlug(reference, slug) : undefined;

  const name = country?.name ?? "Global";
  const code = country?.currency ?? "";
  const currencyName =
    (country && reference?.currencies.find((c) => c.code === country.currency)?.name) ?? "";

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
            {`Buy & sell stablecoins in ${name}`}
          </div>
          <div style={{ color: BRAND.muted, fontSize: 32, marginTop: 20, lineHeight: 1.35 }}>
            Escrow enforced by Solana programs. OpenFiat never takes custody of your fiat.
          </div>
        </div>

        {/*
          * A row of payment-method pills used to sit here, taken from a
          * hand-written currency-to-rails table. An OpenGraph card is the
          * one piece of a page that is read where the page is not, so a
          * claim on it cannot be qualified, corrected or checked — and this
          * one asserted which rails a country's merchants took whether or
          * not anybody was advertising there. What replaces it is the
          * protocol's own guarantee, which is true of every market on this
          * network with no book to consult.
          */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
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
            Non-custodial · on-chain escrow · wallet-bound reputation
          </div>
        </div>
      </div>
    ),
    size,
  );
}
