import type { Metadata } from "next";
import Link from "next/link";
import { CURRENT_USER, MERCHANTS, reputationFor } from "@/lib/data/merchants";
import { STAKING_SUMMARY } from "@/lib/data/staking";
import { getCountry } from "@/lib/data/countries";
import { formatNumber, shortAddress } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
import { AddressOnchain } from "@/components/explorer/address-onchain";
import { MerchantCell } from "@/components/merchant-cell";
import { MetricStrip } from "@/components/metrics";
import { Panel } from "@/components/panel";
import { TierBadge } from "@/components/tier-badge";

export const metadata: Metadata = {
  title: "Address",
};

interface Params {
  address: string;
}

export default async function AddressPage({ params }: { params: Promise<Params> }) {
  const { address: raw } = await params;
  const address = decodeURIComponent(raw);

  const merchant =
    address === CURRENT_USER.wallet
      ? CURRENT_USER
      : MERCHANTS.find((m) => m.wallet === address || m.id === address);

  return (
    <section>
      <Link href="/explorer" className="text-sm text-gray-500 hover:text-white">
        ← Back to Explorer
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-white">Address</h1>
        <span className="flex items-center gap-2 font-mono text-sm text-gray-400">
          {address.length > 20 ? shortAddress(address) : address}
          <CopyButton value={address} />
        </span>
      </div>

      {!merchant ? (
        <Panel className="mt-8">
          <div className="px-4 py-14 text-center">
            <p className="text-sm text-gray-400">Not found in the simulated index.</p>
            <p className="mt-2 text-xs text-gray-600">
              This demo indexes simulated merchants and your own wallet only. Once connected to a live node, any
              address resolves here.
            </p>
          </div>
        </Panel>
      ) : merchant.id === CURRENT_USER.id ? (
        <CurrentUserView address={address} />
      ) : (
        <MerchantView merchantId={merchant.id} />
      )}
    </section>
  );
}

function MerchantView({ merchantId }: { merchantId: string }) {
  const merchant = MERCHANTS.find((m) => m.id === merchantId)!;
  const country = getCountry(merchant.countryCode);
  const reputation = reputationFor(merchant);
  const topDimensions = reputation.slice(0, 4);

  return (
    <div className="mt-8 space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <MerchantCell merchant={merchant} size="md" />
        <Link href={`/merchants/${merchant.id}`} className="text-sm text-brand hover:text-brand-hover">
          View full profile →
        </Link>
      </div>

      <MetricStrip
        items={[
          { label: "Country", value: `${country?.flag ?? ""} ${country?.name ?? merchant.countryCode}` },
          { label: "Identity level", value: merchant.identityLevel },
          { label: "Staked OPEN", value: `${formatNumber(merchant.stake, 0)} OPEN` },
          { label: "Tier", value: merchant.tier },
          { label: "Settlement speed", value: merchant.settlementSpeed },
        ]}
      />

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Reputation summary</h2>
        <div className="mt-3">
          <Panel>
            <ol className="divide-y divide-white/5">
              {topDimensions.map((d) => (
                <li key={d.label} className="flex items-center gap-4 px-4 py-3 text-sm">
                  <span className="w-40 shrink-0 text-gray-300">{d.label}</span>
                  <span className="h-1 flex-1 rounded-full bg-white/10">
                    <span className="block h-1 rounded-full bg-brand" style={{ width: `${d.score}%` }} />
                  </span>
                  <span className="w-40 shrink-0 text-right text-xs tabular-nums text-gray-500">{d.display}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>

      {/*
        * A "recent trades with you" table used to live here, sourced from
        * `TRADES` — a fixture keyed by this simulated merchant directory's
        * own ids. There is no live equivalent: real trades are keyed by
        * PeerId, and this directory's merchants have none, so there is
        * nothing real to filter by. See `/orders` for actual trades.
        */}
      <p className="text-sm text-gray-500">
        Real trades are keyed by PeerId, not by this simulated directory —{" "}
        <Link href="/orders" className="text-brand hover:text-brand-hover">see your actual trades</Link>.
      </p>
    </div>
  );
}

function CurrentUserView({ address }: { address: string }) {
  return (
    <div className="mt-8 space-y-8">
      <div className="flex items-center gap-3">
        <MerchantCell merchant={CURRENT_USER} size="md" />
        <TierBadge tier={CURRENT_USER.tier} />
        <span className="text-xs text-gray-500">This is you</span>
      </div>

      <MetricStrip
        items={[
          { label: "Identity level", value: CURRENT_USER.identityLevel },
          { label: "Staked OPEN", value: `${formatNumber(STAKING_SUMMARY.totalStaked, 0)} OPEN` },
          { label: "Merchant bond", value: `${formatNumber(STAKING_SUMMARY.merchantBond, 0)} OPEN` },
          { label: "Reputation tier", value: CURRENT_USER.tier },
        ]}
      />

      {/* Real, and specific to the address in the URL — see
          `components/explorer/address-onchain.tsx` for what these two
          sections used to show instead. */}
      <AddressOnchain address={address} />

      <p className="text-sm text-gray-500">
        <Link href="/orders" className="text-brand hover:text-brand-hover">See your actual trades →</Link>
      </p>
    </div>
  );
}
