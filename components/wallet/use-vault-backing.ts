"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { fetchVault, parseBaseUnits, type LiveVault } from "@/lib/live-vaults";

/**
 * The liquidity vault backing one (merchant, mint) pair, for the two screens
 * that must not let a number past without one.
 *
 * # The five outcomes are not four
 *
 * Both call sites previously said, correctly, that they could not verify
 * anything: they were keyed on a ticker string, and a ticker maps to no
 * mint. That is fixed by the advertisement carrying `asset_mint` and the
 * merchant's wallet being recoverable from its PeerId — so the read is now
 * possible, and the interesting question becomes what to say when it does
 * not come back.
 *
 * `none` and `error` are kept apart for that reason, and neither is allowed
 * to render as a shortfall. "This merchant has no vault for this mint" is a
 * fact the chain asserted. "I could not reach the cluster" is not a fact
 * about the merchant at all, and showing it as though it were would tell a
 * trader an advertisement is unbacked when it may be fully funded. The
 * reverse error is worse: treating an unreachable RPC as "fine" is how a
 * screen approves a trade against nothing.
 */
export type VaultBacking =
  /** Not enough information to key the read yet — no wallet, or no valid mint. */
  | { kind: "unkeyed" }
  | { kind: "loading" }
  /** The chain answered: this merchant has never created a vault for this mint. */
  | { kind: "none" }
  | { kind: "found"; vault: LiveVault }
  /** The lookup failed. Says nothing about the merchant's balance. */
  | { kind: "error"; message: string };

/**
 * Reads the vault for `merchant` and `mint`, both as base58 strings.
 *
 * Either being `null` or unparseable yields `unkeyed` rather than an error:
 * a wizard with no wallet connected and a half-typed mint is an ordinary
 * state, not a failure.
 */
export function useVaultBacking(merchant: string | null, mint: string | null): VaultBacking {
  const [state, setState] = useState<VaultBacking>({ kind: "unkeyed" });

  useEffect(() => {
    if (!merchant || !mint) {
      setState({ kind: "unkeyed" });
      return;
    }

    let merchantKey: PublicKey;
    let mintKey: PublicKey;
    try {
      merchantKey = new PublicKey(merchant);
      mintKey = new PublicKey(mint);
    } catch {
      // A mint the user is still typing is not an error to report at them.
      setState({ kind: "unkeyed" });
      return;
    }

    let cancelled = false;
    setState({ kind: "loading" });
    fetchVault(merchantKey, mintKey)
      .then((vault) => {
        if (cancelled) return;
        setState(vault ? { kind: "found", vault } : { kind: "none" });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [merchant, mint]);

  return state;
}

/**
 * Whether `vault` can back `amount`, where `amount` is a decimal string in
 * whole tokens as typed into a form.
 *
 * Compared against `available`, never `total`. `total` is deposits minus
 * withdrawals and is never reduced by settlement, so a vault that has traded
 * away everything it held still reports its full historical deposit — using
 * it here would approve a trade against money that is gone. `available` is
 * the only figure the escrow program itself will let a reservation draw
 * against, so it is the only one an interface should imply is spendable.
 *
 * Returns `null` when `amount` is not a quantity this mint can represent,
 * which the caller should treat as "nothing to check yet" rather than as a
 * shortfall.
 */
export function vaultCovers(
  vault: LiveVault,
  amount: string,
): { covered: boolean; required: bigint; available: bigint } | null {
  const required = parseBaseUnits(amount, vault.decimals);
  if (required === null) return null;
  return { covered: vault.available >= required, required, available: vault.available };
}
