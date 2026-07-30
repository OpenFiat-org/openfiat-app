"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MERCHANTS } from "@/lib/data/merchants";

/**
 * Explorer search: routes to a trade room, a merchant profile, or the
 * address page, in that order.
 *
 * The trade-id branch used to also check a fixture (`TRADES`) for an exact
 * match before falling back to the `/^TRD-/i` shape heuristic. Real trade
 * ids are node-assigned reservation ids with no fixed prefix, so that exact
 * lookup never had a live counterpart to replace it with — the query is
 * routed to `/orders/<id>`, which reads the real trade (or reports it
 * missing) itself.
 */
export function ExplorerSearch() {
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
    const merchant = MERCHANTS.find(
      (m) => m.id === q || m.name.toLowerCase() === q.toLowerCase() || m.wallet === q,
    );
    if (merchant) {
      router.push(merchant.wallet === q ? `/explorer/address/${q}` : `/merchants/${merchant.id}`);
      return;
    }
    router.push(`/explorer/address/${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={search} className="flex max-w-2xl gap-2.5">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by address, trade id (TRD-…), or merchant…"
        className="w-full rounded-md border border-white/10 bg-transparent px-4 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-brand/50"
      />
      <button type="submit" className="shrink-0 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover">
        Search
      </button>
    </form>
  );
}
