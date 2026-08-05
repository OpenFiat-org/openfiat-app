import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";

import { CopyButton } from "@/components/copy-button";
import { AddressOnchain } from "@/components/explorer/address-onchain";
import { AddressProtocol } from "@/components/explorer/address-protocol";
import { shortAddress } from "@/lib/format";

export const metadata: Metadata = {
  title: "Address",
};

interface Params {
  address: string;
}

/**
 * Everything this app can read about one address, from both halves of the
 * system it spans.
 *
 * # What this replaced
 *
 * The page resolved the address against `MERCHANTS` — a fixture of invented
 * wallets — and rendered a country, tier, identity level, settlement speed,
 * scored reputation dimensions and `STAKING_SUMMARY`'s 25,000 staked OPEN.
 * Anything not in that fixture, meaning every real address, got "Not found
 * in the simulated index". So the one page whose entire purpose is to answer
 * about an arbitrary address answered only about wallets that do not exist,
 * and the staked figure it showed for "you" was the same number for
 * everybody.
 *
 * # No "not found", by construction
 *
 * There is nothing to be absent from. An address is asked about directly:
 * the chain answers for its accounts and vaults, and the node answers for
 * the PeerId derived from the same key. A wallet that has done nothing gets
 * a page saying so — which is a real answer about a real address, and the
 * thing an explorer exists to give.
 */
export default async function AddressPage({ params }: { params: Promise<Params> }) {
  const { address: raw } = await params;
  const address = decodeURIComponent(raw);

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

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">
        On chain
      </h2>
      <div className="mt-3">
        <AddressOnchain address={address} />
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">
        On the protocol
      </h2>
      <div className="mt-3">
        <AddressProtocol address={address} />
      </div>

      <p className="mt-10 max-w-3xl text-xs leading-relaxed text-gray-500">
        Two different systems, deliberately kept apart. The chain holds token
        accounts and escrow vaults and answers the same for everyone reading
        it; the protocol half is whatever your access node has replicated, so
        a node that has seen less of the network reports less. Your own trades
        are at{" "}
        <Link href="/orders" className="text-brand hover:text-brand-hover">
          /orders
        </Link>
        , which needs a connected wallet — nothing here does.
      </p>
    </section>
  );
}
