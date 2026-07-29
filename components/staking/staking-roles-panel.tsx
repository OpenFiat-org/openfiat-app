"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { STAKING_ROLES, type StakingRole } from "@/lib/data/staking";
import { WALLET_CHANGED_EVENT, readWalletConnection } from "@/lib/wallet-connection";
import { fetchStakeAccount, fetchStakingConfig } from "@/lib/live-staking";
import { formatNumber } from "@/lib/format";
import { StatusPill } from "@/components/status-pill";

/** `lib/data/staking.ts`'s 4 UI role buckets → the real on-chain `Role`
 *  enum (OFS-4200 §2) — `StakeAccount` is keyed by `(owner, role)`, so
 *  this mapping is what tells `staking.stakeAccountPda` which PDA to
 *  read for each row. "provider" is deliberately mapped to
 *  NotificationProvider as a representative service-provider role —
 *  the real program has 4 separate provider roles this single UI
 *  bucket doesn't distinguish between.
 */
const ROLE_TO_ONCHAIN: Record<string, number> = {
  merchant: 0, // Role.Merchant
  arbitrator: 1, // Role.Arbitrator
  node: 2, // Role.NodeOperator
  provider: 3, // Role.NotificationProvider
};

const DECIMALS = 1_000_000_000; // OPEN has 9 decimals (OFS-4100 §1)

function toHuman(raw: bigint): number {
  return Number(raw) / DECIMALS;
}

function useLiveStaking() {
  const [minStakeByRole, setMinStakeByRole] = useState<number[] | null>(null);
  const [positions, setPositions] = useState<Record<string, number | null>>({});
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const updateWallet = () => setWalletAddress(readWalletConnection()?.address ?? null);
    updateWallet();
    window.addEventListener(WALLET_CHANGED_EVENT, updateWallet);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, updateWallet);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const config = await fetchStakingConfig();
        if (cancelled) return;
        setMinStakeByRole(config ? config.minStakeByRole.map(toHuman) : null);

        if (walletAddress) {
          const owner = new PublicKey(walletAddress);
          const entries = await Promise.all(
            Object.entries(ROLE_TO_ONCHAIN).map(async ([key, role]) => {
              const account = await fetchStakeAccount(owner, role);
              return [key, account ? toHuman(account.amount) : 0] as const;
            }),
          );
          if (!cancelled) setPositions(Object.fromEntries(entries));
        } else {
          setPositions({});
        }
      } catch {
        if (!cancelled) setError("Couldn't reach devnet — showing default requirements only.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  return { minStakeByRole, positions, walletAddress, loading, error };
}

/** Maps this panel's role keys onto the on-chain `Role` discriminant, which
 *  is also the index into `min_stake_by_role`. */
const ROLE_INDEX: Record<string, number> = {
  merchant: 0,
  arbitrator: 1,
  node: 2,
  provider: 3,
};

function liveMinBond(role: StakingRole, minStakeByRole: number[] | null): number {
  const index = ROLE_INDEX[role.role];
  if (minStakeByRole === null || index === undefined) return role.minBond;
  return minStakeByRole[index] ?? role.minBond;
}

export function StakingRolesPanel() {
  const { minStakeByRole, positions, walletAddress, loading, error } = useLiveStaking();

  return (
    <div>
      {error && <p className="mb-3 text-xs text-amber-300">{error}</p>}
      {!walletAddress && (
        <p className="mb-3 text-xs text-gray-500">Connect a wallet to see what you have staked for each role.</p>
      )}
      <div className="divide-y divide-white/5 border-y border-white/5">
        {STAKING_ROLES.map((r) => {
          const minBond = liveMinBond(r, minStakeByRole);
          const staked = walletAddress ? (positions[r.role] ?? null) : null;
          const active = staked !== null && staked > 0;
          return (
            <div key={r.role} className="flex flex-wrap items-center gap-x-8 gap-y-3 py-6">
              <div className="min-w-64 flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-medium text-white">{r.title}</h3>
                  <StatusPill status={active ? "Online" : "Not started"} />
                </div>
                <p className="mt-1 max-w-xl text-sm text-gray-400">{r.requirement}</p>
              </div>
              <div className="text-sm">
                <p className="text-xs text-gray-500">Required</p>
                <p className="mt-0.5 tabular-nums text-gray-200">
                  {loading ? "…" : `${formatNumber(minBond, 0)} OPEN`}
                </p>
              </div>
              <div className="text-sm">
                <p className="text-xs text-gray-500">You staked</p>
                <p className={`mt-0.5 tabular-nums ${active ? "text-emerald-300" : "text-gray-500"}`}>
                  {staked === null ? "—" : `${formatNumber(staked, 0)} OPEN`}
                </p>
              </div>
              <div className="text-sm">
                <p className="text-xs text-gray-500">Rewards</p>
                <p className="mt-0.5 text-gray-300">{r.rewards}</p>
              </div>
              <Link
                href={`/staking/stake?role=${r.role}`}
                className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
              >
                Stake
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
