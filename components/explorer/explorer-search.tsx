"use client";

import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * Explorer search: routes to a trade room, a merchant profile, or the
 * address page.
 *
 * # Every branch is a shape test, and none is a lookup
 *
 * There used to be a middle branch matching the query against `MERCHANTS` —
 * a fixture — by id, name or wallet, and routing a hit to that merchant's
 * fabricated profile. It could only ever match invented data, so searching
 * for a real merchant's name found nothing and searching for an invented
 * one found a page about nobody.
 *
 * What replaces it is not a live lookup but the absence of one. A PeerId is
 * recognisable by shape (`12D3Koo…`, an Ed25519 identity multihash), and an
 * address is recognisable by being neither of the other two — so this can
 * decide where to send a query without asking a node anything, and the
 * destination page reads the real record and reports honestly when there is
 * none. Searching by *name* is gone with the fixture and does not come back:
 * a MerchantName is a self-published claim readable only per-wallet, so
 * there is nothing to search by name over.
 *
 * The trade-id branch is likewise a shape heuristic. Real trade ids are
 * node-assigned reservation ids with no fixed prefix; `/orders/<id>` reads
 * the real trade, or reports it missing, itself.
 */

/**
 * Base58 with the length and prefix of an Ed25519 PeerId. Exported so
 * `tests/explorer-search.test.ts` can pin it: the whole routing decision
 * rests on telling a PeerId from an address, and both are base58 strings of
 * similar shape.
 */
export function looksLikePeerId(query: string): boolean {
  return /^12D3Koo[1-9A-HJ-NP-Za-km-z]{45}$/.test(query);
}
export function ExplorerSearch() {
  const t = useTranslations("explorer");
  const router = useRouter();
  const [query, setQuery] = useState("");

  function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    if (/^TRD-/i.test(q)) {
      router.push(`/orders/${q.toUpperCase()}`);
      return;
    }
    if (looksLikePeerId(q)) {
      router.push(`/merchants/${q}`);
      return;
    }
    router.push(`/explorer/address/${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={search} className="flex max-w-2xl gap-2.5">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="w-full rounded-md border border-white/10 bg-transparent px-4 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-brand/50"
      />
      <button type="submit" className="shrink-0 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover">
        {t("searchBtn")}
      </button>
    </form>
  );
}
