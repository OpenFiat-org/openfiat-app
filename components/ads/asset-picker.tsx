"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";

import { assetOptions, useReferenceData, type AssetOption } from "@/lib/reference";
import { fetchNativeSolBalance, fetchTokenBalances } from "@/lib/live-token-balances";
import { formatBaseUnits, shortMint } from "@/lib/live-vaults";
import { tradingSymbol } from "@/lib/asset-display";
import { WRAPPED_SOL_MINT } from "@/lib/vault-instructions";
import { AssetIcon } from "@/components/asset-icon";

/**
 * Which token an advertisement is denominated in, chosen by name.
 *
 * # What this replaced
 *
 * A text field with the placeholder "Base58 mint address". The merchant was
 * asked to type a 32-byte public key from memory, and the one affordance
 * beside it was a single button filling in the devnet settlement mint. The
 * reasoning written above that field was sound as far as it went — an
 * advertisement carries `asset_mint` and no ticker, so a picker mapping
 * "USDC" to an address behind the merchant's back would be this app deciding
 * what "USDC" means — but it drew the wrong conclusion from it. The node
 * publishes the mapping. Asking the node is not this app deciding; it is the
 * same resolution the buyer's node will perform on the other side, done
 * before the signature instead of after it.
 *
 * So the rows below are the node's own mint table. What is selected is an
 * address; what is read is a name; and the name is the node's, shown next to
 * the address it stands for so the two are never separated on screen.
 *
 * # The balance is the wallet's, and says so
 *
 * It is `getParsedTokenAccountsByOwner` on the connected wallet — what you
 * hold, not what is in a liquidity vault, and not a price. A failed read
 * renders as unknown rather than as zero: a token you own showing "0" would
 * talk you out of an advertisement you could have posted.
 */
export function AssetPicker({
  value,
  onChange,
  walletAddress,
}: {
  /** The selected mint address, or `""` when nothing has been chosen. */
  value: string;
  onChange: (asset: AssetOption) => void;
  walletAddress: string | null;
}) {
  const reference = useReferenceData();
  const [balances, setBalances] = useState<Map<string, bigint> | null | undefined>(undefined);

  useEffect(() => {
    if (!walletAddress) {
      setBalances(undefined);
      return;
    }
    let live = true;
    void (async () => {
      try {
        const owner = new PublicKey(walletAddress);
        const [held, lamports] = await Promise.all([
          fetchTokenBalances(owner),
          fetchNativeSolBalance(owner),
        ]);
        if (!live) return;
        const totals = new Map<string, bigint>();
        // Summed rather than taken from the first account found: a wallet can
        // hold one mint in several accounts, and showing only one of them
        // under-reports a balance the owner can plainly see elsewhere.
        for (const balance of held) {
          const key = balance.mint.toBase58();
          totals.set(key, (totals.get(key) ?? 0n) + balance.amount);
        }
        /*
         * Native SOL counts towards the native mint's row, and it has to.
         * That row reads `SOL` — the name a merchant is going to advertise
         * in — and a wallet holding two SOL and no wrapped-SOL account would
         * otherwise be told it holds none of the asset it is looking at.
         * The number is honest because the wrapping is automatic: every
         * deposit into a wSOL vault wraps inside its own transaction (see
         * `lib/vault-instructions.ts`), so plain SOL genuinely is stock this
         * advertisement can be backed by.
         */
        const native = WRAPPED_SOL_MINT.toBase58();
        totals.set(native, (totals.get(native) ?? 0n) + lamports);
        setBalances(totals);
      } catch {
        // `null` is "could not read", and the rows say exactly that. It is
        // not the same as an empty map, which means the wallet holds none.
        if (live) setBalances(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [walletAddress]);

  if (reference.status === "loading") {
    return <p className="text-sm text-gray-500">Asking your node which tokens it names…</p>;
  }

  if (reference.status === "error") {
    return (
      <p className="text-sm text-amber-300">
        Couldn&apos;t ask your access node which tokens exist ({reference.message}).{" "}
        <button type="button" onClick={reference.retry} className="underline hover:text-amber-200">
          Try again
        </button>
        <span className="mt-1 block text-[11px] text-gray-600">
          This says nothing about which tokens are tradeable — only that we could not ask.
        </span>
      </p>
    );
  }

  const options = assetOptions(reference.data);

  if (options.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        This node names no token mints, so there is nothing to choose from here. An advertisement
        still needs one, so a node that publishes its mint table is needed before you can post.
      </p>
    );
  }

  return (
    <div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const selected = option.mint === value;
          const held = balances instanceof Map ? balances.get(option.mint) : undefined;
          // The name a merchant will advertise in, which for the native mint
          // is `SOL` and not the node's `wSOL` — see `lib/asset-display.ts`.
          // `option.symbol` is non-null here: `assetOptions` drops the rest.
          const name = tradingSymbol(option.mint, option.symbol) ?? option.symbol;
          return (
            <li key={option.mint}>
              <button
                type="button"
                onClick={() => onChange(option)}
                aria-pressed={selected}
                className={`w-full rounded-md border px-3 py-3 text-left transition-colors ${
                  selected
                    ? "border-brand/50 bg-brand/10"
                    : "border-white/10 hover:border-white/25"
                }`}
              >
                <span className="flex items-center gap-2">
                  <AssetIcon asset={name} size={18} />
                  <span className="text-sm font-medium text-white">{name}</span>
                  <span className="ml-auto text-xs tabular-nums text-gray-400">
                    {balances === undefined
                      ? ""
                      : balances === null
                        ? "balance unavailable"
                        : held === undefined
                          ? "0 in your wallet"
                          : `${formatBaseUnits(held, option.decimals)} in your wallet`}
                  </span>
                </span>
                {/* The address, always, next to the name. A name shown alone
                    would be this screen asserting a mapping the reader has no
                    way to check; shown together, the node's answer is on
                    screen and checkable against a block explorer. */}
                <span
                  className="mt-1 block font-mono text-[11px] text-gray-600"
                  title={option.mint}
                >
                  {shortMint(new PublicKey(option.mint))} · {option.decimals} decimals
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-gray-600">
        Names and precisions come from your node&rsquo;s mint table, and the address is what the
        advertisement carries. What can actually be escrowed is decided by the escrow program on
        chain, which governance can change — so a token listed here is one this node can name, not
        a promise that a trade in it will settle.
        {!walletAddress && " Connect a wallet to see what you hold of each."}
      </p>
    </div>
  );
}
