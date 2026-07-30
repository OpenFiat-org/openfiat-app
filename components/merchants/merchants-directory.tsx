"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { MetricStrip } from "@/components/metrics";
import { WalletAvatar } from "@/components/wallet-avatar";
import { formatCrypto, formatNumber, sinceLabel } from "@/lib/format";
import type { LiveAd } from "@/lib/live-advertisements";
import { fetchMerchants, type MerchantOffering, type MerchantRow } from "@/lib/live-merchants";
import { fetchReputationForPeerId, type LiveReputation } from "@/lib/live-reputation";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";

/**
 * Everyone advertising on the network, from one read of the order book.
 *
 * `lib/live-merchants.ts` carries the argument for what counts as a merchant
 * and for what an advertisement can and cannot be made to say about one. This
 * file is the presentation of that decision; the two rules it adds are here.
 *
 * # One fetch, so the metrics live inside the table's component
 *
 * The counts above the table are derived from the same rows the table renders,
 * not fetched separately. `components/providers/providers-directory.tsx` splits
 * its metric strip into a second exported component so the page can slot it
 * into the hero, and pays for it by calling its hook twice — two reads of the
 * registry on every load, which can disagree with each other. There is no
 * reason to copy that: the strip sits directly above the filters instead, and
 * the hero above it stays static.
 *
 * # A row opens rather than links
 *
 * Nothing here links to `/merchants/<id>`. That route is the fixture profile —
 * `lib/data/merchants.ts` reputations, `lib/data/reviews.ts` reviews — keyed by
 * invented ids that no real PeerId will ever match, so every link would either
 * 404 or, worse, land on somebody else's fabricated history. A row expands in
 * place instead: the merchant's advertisements are already in hand from the
 * book, and their trading record is read on demand from `getReputation`, which
 * is one request for the merchant a reader actually asked about rather than one
 * per merchant on the page.
 */

interface DirectoryState {
  rows: MerchantRow[];
  loading: boolean;
  error: string | null;
}

export function MerchantsDirectory() {
  const [state, setState] = useState<DirectoryState>({ rows: [], loading: true, error: null });
  const [currency, setCurrency] = useState("All");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const selection = readNodeSelection();
      setState((previous) => ({ ...previous, loading: true, error: null }));
      try {
        const rows = await fetchMerchants();
        if (!cancelled) setState({ rows, loading: false, error: null });
      } catch {
        if (!cancelled) {
          setState({
            rows: [],
            loading: false,
            error: `Could not read the advertisement book from ${selection.label}.`,
          });
        }
      }
    }

    void load();
    window.addEventListener(NODE_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(NODE_CHANGED_EVENT, load);
    };
  }, []);

  const { rows, loading, error } = state;
  const currencies = [...new Set(rows.flatMap((row) => row.ads.map((ad) => ad.fiatCurrency)))].sort();
  const visible =
    currency === "All"
      ? rows
      : rows.filter((row) => row.ads.some((ad) => ad.fiatCurrency === currency));

  return (
    <div>
      <MetricStrip
        items={[
          { label: "Merchants", value: loading ? "…" : String(rows.length) },
          {
            label: "Currently advertising",
            value: loading ? "…" : String(rows.filter((r) => r.offering === "Advertising").length),
          },
          {
            label: "Paused",
            value: loading ? "…" : String(rows.filter((r) => r.offering === "On vacation").length),
          },
          { label: "Currencies", value: loading ? "…" : String(currencies.length) },
          {
            label: "Advertisements",
            value: loading ? "…" : String(rows.reduce((sum, r) => sum + r.ads.length, 0)),
          },
        ]}
      />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {["All", ...currencies].map((code) => (
            <button
              key={code}
              onClick={() => setCurrency(code)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                currency === code
                  ? "border-brand/50 bg-brand/10 text-brand-hover"
                  : "border-white/10 text-gray-400 hover:text-white"
              }`}
            >
              {code}
            </button>
          ))}
        </div>
        {error ? (
          <span className="text-xs text-amber-300">{error}</span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-amber-400" : "bg-emerald-400"}`} />
            {loading ? "Reading the book…" : "Live from your access node"}
          </span>
        )}
      </div>

      <div className="mt-4">
        <DataTable
          minWidth={940}
          head={
            <tr>
              <Th>Merchant</Th>
              <Th>Offering</Th>
              <Th>Pairs</Th>
              <Th>Payment methods</Th>
              <Th right>Ads</Th>
              <Th right>Advertising since</Th>
            </tr>
          }
        >
          {visible.map((row) => (
            <MerchantRows
              key={row.peerId}
              row={row}
              open={open === row.peerId}
              onToggle={() => setOpen(open === row.peerId ? null : row.peerId)}
            />
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                {loading
                  ? "Reading the book…"
                  : error
                    ? "Nothing to show — the book could not be read."
                    : /* An empty book and an empty directory are the same
                         fact, and saying so is more useful than "no results". */
                      "No wallet has published an advertisement to this node yet."}
              </td>
            </tr>
          )}
        </DataTable>
      </div>

      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-gray-500">
        A merchant is a wallet that has published an advertisement. There is no
        merchant register in the protocol, so this list is everyone currently
        offering a trade — including those who have paused — and a wallet that
        deletes its last advertisement leaves it. Names and pictures appear only
        where the wallet published them as identity claims; the rest are drawn
        from the key itself.
      </p>
    </div>
  );
}

/**
 * A row and, when open, its detail row. Returned as a fragment so both are
 * direct children of `<tbody>` and keep the table's own dividers, rather than
 * nesting a second table inside a cell.
 */
function MerchantRows({
  row,
  open,
  onToggle,
}: {
  row: MerchantRow;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <Tr>
        <Td py="py-5">
          {/* A real button rather than a click handler on the row: the row is
              the only control here, and one that keyboard focus and screen
              readers can reach costs nothing to write correctly. */}
          <button
            onClick={onToggle}
            aria-expanded={open}
            className="flex items-center gap-2.5 text-left"
          >
            {/* Seeded by the PeerId in the same hex spelling the order book
                uses, so one merchant is the same robot on every screen. */}
            <WalletAvatar seed={row.peerId} label={`Merchant …${row.short}`} size={32} />
            <span>
              <span className="block font-mono text-sm text-white">…{row.short}</span>
              <span className="block text-xs text-gray-600">
                {open ? "Hide" : "Trading record and ads"}
              </span>
            </span>
          </button>
        </Td>
        <Td py="py-5">
          <OfferingPill offering={row.offering} />
        </Td>
        <Td py="py-5" className="max-w-64">
          <span className="line-clamp-2 text-xs text-gray-400">{row.pairs.join(" · ")}</span>
        </Td>
        <Td py="py-5" className="max-w-64">
          <span className="line-clamp-2 text-xs text-gray-400">
            {row.paymentMethods.length > 0 ? row.paymentMethods.join(" · ") : "None named"}
          </span>
        </Td>
        <Td py="py-5" right num className="text-gray-300">
          {row.ads.length}
        </Td>
        <Td py="py-5" right className="text-xs text-gray-400">
          {new Date(row.firstAdvertisedAt).toLocaleDateString()}
          <span className="block text-[11px] text-gray-600">
            last change {sinceLabel(row.lastUpdatedAt)}
          </span>
        </Td>
      </Tr>
      {open && (
        <tr>
          <td colSpan={6} className="bg-white/[0.02] px-4 py-6">
            <MerchantDetail row={row} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * `components/status-pill.tsx` has no tone for these three words and they are
 * not protocol statuses — `Advertising` is a conclusion drawn across several
 * advertisements, not a value on any of them — so they get their own small pill
 * here rather than a case added to a shared component that renders real
 * `AdvertisementStatus` values elsewhere.
 */
function OfferingPill({ offering }: { offering: MerchantOffering }) {
  const tone =
    offering === "Advertising"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : offering === "On vacation"
        ? "border-white/15 bg-white/5 text-gray-400"
        : "border-amber-400/30 bg-amber-400/10 text-amber-300";
  return (
    <span
      title={
        offering === "Advertising"
          ? "At least one advertisement is Active."
          : offering === "On vacation"
            ? "Every advertisement is in Vacation — a pause the merchant set themselves (OFS-2100 §16)."
            : "Every advertisement is Disabled: manually turned off, or automatically because liquidity hit zero (OFS-2100 §18)."
      }
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}
    >
      {offering}
    </span>
  );
}

function MerchantDetail({ row }: { row: MerchantRow }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <TradingRecord peerId={row.peerId} />
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Advertisements
        </h3>
        <ul className="mt-3 space-y-2">
          {row.ads.map((ad) => (
            <AdLine key={ad.id} ad={ad} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function AdLine({ ad }: { ad: LiveAd }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-white/10 px-3 py-2 text-xs">
      <span className={ad.direction === "Sell" ? "text-emerald-400" : "text-orange-400"}>
        {ad.direction}
      </span>
      <span className="text-gray-300">
        {ad.asset}/{ad.fiatCurrency}
      </span>
      <span className="font-mono tabular-nums text-gray-200">
        {/* A floating advertisement has no price on the record at all —
            OFS-2100 §11 stores the premium, and the number is resolved
            against an oracle read that may not exist. Saying so beats
            printing a dash that reads as zero. */}
        {ad.price === null
          ? ad.pricingKind === "Floating"
            ? `Floating ${ad.premiumBps !== null && ad.premiumBps >= 0 ? "+" : ""}${
                ad.premiumBps !== null ? ad.premiumBps / 100 : 0
              }% — no oracle price`
            : "Unpriced"
          : `${formatNumber(ad.price)} ${ad.fiatCurrency}`}
      </span>
      <span className="text-gray-500">
        {formatNumber(ad.minTrade, 0)}–{formatNumber(ad.maxTrade, 0)} {ad.asset}
      </span>
      <span className="text-gray-500">{formatCrypto(ad.availableLiquidity, ad.asset)} free</span>
      <span className="ml-auto flex items-center gap-3">
        <span className={ad.status === "Active" ? "text-gray-400" : "text-gray-600"}>
          {ad.status}
        </span>
        {ad.status === "Active" && (
          <Link href={`/orders/new?ad=${ad.id}`} className="text-brand-hover hover:underline">
            Trade →
          </Link>
        )}
      </span>
    </li>
  );
}

/**
 * The merchant's conduct, as `crates/reputation` computes it from settlement,
 * dispute and reservation state.
 *
 * Every figure is a counter or a ratio of counters. There is no score, no tier
 * and no rating, because the node returns none: `getReputation` serializes
 * `ReputationProfile`'s fields, and its `tier()` is a method whose thresholds
 * the crate itself marks as placeholders pending governance. A wallet with no
 * history says so rather than rendering zeroes, which read as a bad record
 * instead of an absent one.
 */
function TradingRecord({ peerId }: { peerId: string }) {
  const [data, setData] = useState<LiveReputation | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setData(await fetchReputationForPeerId(peerId));
    } catch {
      setError(true);
    }
  }, [peerId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        Trading record
      </h3>
      {error ? (
        <p className="mt-3 text-xs text-amber-300">
          Your access node did not answer for this wallet.
        </p>
      ) : !data ? (
        <p className="mt-3 text-xs text-gray-500">Reading…</p>
      ) : data.empty ? (
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          This node has no settlements, disputes or payments involving this
          wallet. It has advertised but not yet traded — or has traded only
          through peers this node has not replicated from.
        </p>
      ) : (
        <dl className="mt-3 divide-y divide-white/5 text-xs">
          <Fact label="Trades started" value={String(data.tradesStarted)} />
          <Fact label="Completed" value={String(data.tradesCompleted)} />
          <Fact
            label="Completion rate"
            value={data.completionRate === null ? "—" : percent(data.completionRate)}
            hint="Completed settlements ÷ started settlements (OFS-3000 §8). Not a rating."
          />
          <Fact label="Cancelled" value={String(data.tradesCancelled)} />
          <Fact
            label="Disputes"
            value={`${data.disputesInvolved} involved · ${data.disputesLost} lost`}
          />
          <Fact
            label="Answered payment claims"
            value={data.responseRate === null ? "Never asked" : percent(data.responseRate)}
            hint="How often this wallet, as merchant, approved or rejected a buyer's payment declaration at all (OFS-3000 §13)."
          />
          <Fact
            label="Mean time to answer"
            value={data.meanResponseMs === null ? "—" : duration(data.meanResponseMs)}
            hint="Measured between two signed events: the buyer declaring payment and the merchant ruling on it. Not an advertised turnaround."
          />
          <Fact
            label="Mean settlement"
            value={data.medianSettlementMs === null ? "—" : duration(data.medianSettlementMs)}
          />
          <Fact
            label="Missed reservations"
            value={String(data.reservationsMissed)}
            hint="Reservations this wallet requested and let expire."
          />
          <Fact
            label="First traded"
            value={
              data.firstActiveAt === null
                ? "—"
                : new Date(data.firstActiveAt).toLocaleDateString()
            }
          />
        </dl>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-gray-600">
        Computed by your access node from settlements, disputes and reservations
        it has replicated — nothing here is asserted by the merchant. A node that
        has seen less of the network will report less.
      </p>
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className={`text-gray-500 ${hint ? "cursor-help" : ""}`} title={hint}>
        {label}
      </dt>
      <dd className="text-right tabular-nums text-gray-200">{value}</dd>
    </div>
  );
}

function percent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 36 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}
