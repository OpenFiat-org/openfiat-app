import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

import { CopyButton } from "@/components/copy-button";
import { AddressOnchain } from "@/components/explorer/address-onchain";
import { AddressProtocol } from "@/components/explorer/address-protocol";
import { shortAddress } from "@/lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "explorer" });
  return { title: t("addressMetaTitle") };
}

interface Params {
  locale: string;
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
  const { locale, address: raw } = await params;
  const address = decodeURIComponent(raw);
  const t = await getTranslations({ locale, namespace: "explorer" });

  return (
    <section>
      <Link href="/explorer" className="text-sm text-gray-500 hover:text-white">
        {t("backToExplorer")}
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-white">{t("addressHeading")}</h1>
        <span className="flex items-center gap-2 font-mono text-sm text-gray-400">
          {address.length > 20 ? shortAddress(address) : address}
          <CopyButton value={address} />
        </span>
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">
        {t("onChainHeading")}
      </h2>
      <div className="mt-3">
        <AddressOnchain address={address} />
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">
        {t("onProtocolHeading")}
      </h2>
      <div className="mt-3">
        <AddressProtocol address={address} />
      </div>

      <p className="mt-10 max-w-3xl text-xs leading-relaxed text-gray-500">
        {t.rich("addressPageFooter", {
          orders: (c) => (
            <Link href="/orders" className="text-brand hover:text-brand-hover">
              {c}
            </Link>
          ),
        })}
      </p>
    </section>
  );
}
