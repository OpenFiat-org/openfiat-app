import type { ServiceType } from "@/lib/types";

/**
 * Display vocabulary for the Service Registry (OFS-1500) — the label and
 * colour each service type is rendered with.
 *
 * This file used to hold the registry itself, as a fixture: 19 invented
 * services with invented uptime, pricing, regions and latencies, which
 * backed the directory table, its metric strip, a per-provider detail
 * route, and 19 sitemap entries submitted to search engines as real,
 * indexable pages. `lib/live-providers.ts` reads the actual registry from
 * the selected node now.
 *
 * What remains is not data about anyone. It is how a type is drawn,
 * needed to render whatever the registry returns.
 */

export const PROVIDER_TYPES: Record<ServiceType, string> = {
  "Notification Provider": "Notifications",
  "Oracle Provider": "Price Oracles",
  "Risk Intelligence Provider": "Risk Intelligence",
  "Snapshot Provider": "Snapshots",
  "Merchant Gateway": "Merchant Gateways",
  "Public API Node": "API Nodes",
};

/** Type accent colors for directory markers. */
export const TYPE_COLORS: Record<ServiceType, { dot: string; text: string }> = {
  "Notification Provider": { dot: "bg-sky-400", text: "text-sky-300" },
  "Oracle Provider": { dot: "bg-amber-400", text: "text-amber-300" },
  "Risk Intelligence Provider": { dot: "bg-red-400", text: "text-red-300" },
  "Snapshot Provider": { dot: "bg-brand-teal", text: "text-brand-teal" },
  "Merchant Gateway": { dot: "bg-violet-400", text: "text-violet-300" },
  "Public API Node": { dot: "bg-gray-400", text: "text-gray-300" },
};


/* The provider fixture used to continue from here: 19 invented services
   with invented uptime percentages, pricing, regions and latencies. It
   backed the directory table, the page's metric strip, a per-provider
   detail route, and 19 sitemap entries submitted to search engines as
   real, indexable pages.

   `lib/live-providers.ts` reads the actual OFS-1500 registry from the
   selected node instead. What remains above is display vocabulary — the
   label and colour for each service type — which is not a claim about
   anyone and is needed to render whatever the registry returns. */
