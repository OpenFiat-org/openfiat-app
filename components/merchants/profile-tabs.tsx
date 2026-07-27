"use client";

import { useState, type ReactNode } from "react";
import type { MerchantReview } from "@/lib/types";
import { formatDateShort } from "@/lib/format";

/**
 * Ads and Reviews, as tabs.
 *
 * Client state rather than a search parameter: reading one would turn this route
 * dynamic and cost the prerendering on every merchant page, which is the same
 * trade that caught me on the country pages. A tab is view state, not an
 * address.
 */
export function ProfileTabs({
  adCount,
  ratingCount,
  reviews,
  ads,
}: {
  adCount: number;
  /** All ratings, not just written ones — see below. */
  ratingCount: number;
  reviews: MerchantReview[];
  ads: ReactNode;
}) {
  const [tab, setTab] = useState<"ads" | "reviews">("ads");

  return (
    <div className="mt-10">
      <div className="flex items-center gap-6 border-b border-white/10">
        <TabButton active={tab === "ads"} onClick={() => setTab("ads")}>
          Ads <span className="text-gray-600">({adCount})</span>
        </TabButton>
        <TabButton active={tab === "reviews"} onClick={() => setTab("reviews")}>
          Reviews <span className="text-gray-600">({reviews.length})</span>
        </TabButton>
      </div>

      {tab === "ads" ? (
        <div className="mt-3">{ads}</div>
      ) : (
        <div className="mt-3">
          {reviews.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">
              No written reviews yet. This merchant has {ratingCount.toLocaleString("en-US")}{" "}
              ratings — most people rate a trade without writing anything.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-white/5 border-y border-white/5">
                {reviews.map((r) => (
                  <li key={r.id} className="flex gap-3 py-4">
                    <span
                      aria-hidden
                      className={`mt-0.5 shrink-0 text-sm ${
                        r.positive ? "text-emerald-300" : "text-amber-300"
                      }`}
                      title={r.positive ? "Positive" : "Negative"}
                    >
                      {r.positive ? "▲" : "▼"}
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-baseline gap-x-2.5 text-xs text-gray-500">
                        <span className="font-mono text-gray-400">{r.rater}</span>
                        <span>{r.side} · {formatDateShort(r.at)}</span>
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-gray-300">{r.comment}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {/* Written reviews are a small subset of ratings, so the two counts
                  differ on purpose. Left unexplained it reads as missing data. */}
              <p className="mt-4 text-xs leading-relaxed text-gray-500">
                Showing the {reviews.length} reviews that came with a comment, of{" "}
                {ratingCount.toLocaleString("en-US")} ratings in total. Most people rate a trade
                without writing anything.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 pb-2.5 text-sm transition-colors ${
        active
          ? "border-brand font-medium text-white"
          : "border-transparent text-gray-400 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
