"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MERCHANTS } from "@/lib/data/merchants";
import { TRADES } from "@/lib/data/trades";

/**
 * Simulated explorer search: resolves trade ids, merchant names/ids, and
 * wallet addresses, then routes to the right page. Unknown input routes to
 * the address page's graceful "not in simulated index" state.
 */
export function ExplorerSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    const trade = TRADES.find((t) => t.id.toLowerCase() === q.toLowerCase());
    if (trade || /^TRD-/i.test(q)) {
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
