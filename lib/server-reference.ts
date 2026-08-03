import { cache } from "react";
import type { ReferenceData } from "@openfiat/sdk";

import { DEFAULT_NODE_URL } from "@/lib/node-endpoint";
import { nodeRpc } from "@/lib/node-rpc";

/**
 * The node's reference data for a server render — country pages, their
 * OpenGraph cards, and the sitemap.
 *
 * # Why `null` rather than a throw
 *
 * Because every caller has something honest to render without it, and none
 * of them has anything honest to render *instead* of it. A country page that
 * cannot reach a node says so; a sitemap that cannot reach one emits fewer
 * routes and recovers on the next build. What none of them may do is fall
 * back to a list compiled in here, which is the thing this whole module
 * exists to have removed — see `lib/countries.ts`.
 *
 * # Memoised for one render, and no longer
 *
 * `generateMetadata`, `generateStaticParams` and the page body are separate
 * entries into a route for a single view, and `cache()` collapses them into
 * one request. It deliberately does not outlive the render: a longer-lived
 * cache is this app holding a copy of somebody else's table again, just with
 * an expiry on it.
 *
 * The endpoint is the build's default rather than a user's selection. There
 * is no localStorage on a server, and a prerendered page has no user.
 */
export const referenceForRender = cache(
  async (endpoint: string = DEFAULT_NODE_URL): Promise<ReferenceData | null> => {
    try {
      return await nodeRpc<ReferenceData>(endpoint, "getReferenceData");
    } catch {
      return null;
    }
  },
);
