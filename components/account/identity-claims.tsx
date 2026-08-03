"use client";

import { useEffect, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { Panel } from "@/components/panel";
import { formatDateMs, shortAddress } from "@/lib/format";
import {
  fetchIdentityClaims,
  inactiveReason,
  replacedClaimIds,
  type IdentityClaimRecord,
} from "@/lib/live-identity";
import { readWalletConnection, WALLET_CHANGED_EVENT } from "@/lib/wallet-connection";

/**
 * The connected wallet's identity claims, read from the selected node.
 *
 * # What this replaces
 *
 * A four-row table of hardcoded identity levels, identical for every visitor:
 * a masked email `t***@openwallet.ke`, a phone `+254 7** *** 234`, a business
 * "OpenWallet Ke", and three dates in March and April 2026. A wallet that had
 * published nothing — including a wallet that had never connected — was shown
 * a completed L0, L1 and L2 with green Verified pills against somebody else's
 * contact details.
 *
 * The Level 3 row was worse than invented, because it invented requirements
 * rather than facts: "Requires 99.9% uptime over 90 days" and "Requires
 * 50,000 OPEN infrastructure bond". Neither figure exists anywhere in the
 * protocol. Nothing measures uptime, no bond of that name is taken, and
 * OFS-5000 §8 asks for no threshold of any kind at Level 3 — it lists the
 * kinds of claim an infrastructure operator may publish, and that is all. A
 * reader planning around those numbers was planning around fiction.
 *
 * # Why there is no level column here
 *
 * A level is not stored. `crates/identity`'s `Claim` has a type, a value, a
 * verification status, an expiry, a revocation flag and a supersedes link —
 * there is no level field, no level index, and nothing in the codebase gates
 * on one. §8 defines levels as a description of what a wallet has chosen to
 * publish, and says outright that participation never requires advancing
 * beyond Level 0.
 *
 * So the honest thing to show is the claims, which are real, and to explain
 * what levels are rather than asserting one. Deriving "you are L2" from the
 * presence of a MerchantName claim would be this app inventing a rule the
 * protocol does not have, and putting a number on a person on that basis.
 */
export function IdentityClaimsPanel() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [claims, setClaims] = useState<IdentityClaimRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const read = () => setWallet(readWalletConnection()?.address ?? null);
    read();
    window.addEventListener(WALLET_CHANGED_EVENT, read);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, read);
  }, []);

  useEffect(() => {
    if (!wallet) {
      setClaims(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchIdentityClaims(wallet)
      .then((result) => !cancelled && setClaims(result))
      .catch(() => !cancelled && setError("Could not reach your access node."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  if (!wallet) {
    return (
      <Panel title="Your identity claims">
        <p className="px-4 py-10 text-center text-sm text-gray-500">
          Connect a wallet. A claim is an assertion about a key, so there is no account to open
          and nothing to show until a key is connected.
        </p>
      </Panel>
    );
  }

  const replaced = claims ? replacedClaimIds(claims) : new Set<string>();

  return (
    <Panel title="Your identity claims">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3 font-mono text-xs text-gray-500">
        {shortAddress(wallet)}
        <CopyButton value={wallet} />
      </div>

      {loading && (
        <p className="px-4 py-10 text-center text-sm text-gray-500">Reading from your node…</p>
      )}
      {error && <p className="px-4 py-10 text-center text-sm text-amber-300">{error}</p>}

      {claims?.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-gray-500">
          This wallet has published no claims. That is Level 0, and it is enough to trade — nothing
          in the protocol requires more.
        </p>
      )}

      {claims && claims.length > 0 && (
        <ul className="divide-y divide-white/5">
          {claims.map((claim) => (
            <ClaimRow key={claim.claimId} claim={claim} inactive={inactiveReason(claim, replaced)} />
          ))}
        </ul>
      )}

      <p className="border-t border-white/10 px-4 py-2.5 text-[11px] text-gray-600">
        Revoked, expired and superseded claims are shown rather than hidden. A claim is never
        deleted (OFS-5000 §11) — publishing a new value archives the old one — so this is what a
        counterparty inspecting your wallet sees too.
      </p>
    </Panel>
  );
}

function ClaimRow({
  claim,
  inactive,
}: {
  claim: IdentityClaimRecord;
  inactive: string | null;
}) {
  const isEncryptionKey = !claim.custom && claim.type === "EncryptionKey";
  return (
    <li className={`px-4 py-3 ${inactive ? "opacity-55" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-gray-200">
          {isEncryptionKey ? "Encryption key" : claim.type}
          {claim.custom && (
            <span className="ml-2 text-[11px] uppercase tracking-wider text-gray-600">custom</span>
          )}
        </p>
        <div className="flex items-center gap-2 text-[11px]">
          {inactive && (
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-gray-400">
              {inactive}
            </span>
          )}
          {/*
           * Deliberately worded as an assertion rather than as a verdict.
           * `crates/identity`'s own module doc records that OTP delivery is
           * not implemented and that the publisher decides what to set here,
           * so a green "Verified" badge would credit a check nobody ran.
           *
           * The one exception is an encryption key, and it is a real one: a
           * node parses that value and refuses a malformed or small-order
           * point at publication, because a grant sealed to one would be
           * readable by every node holding a replica. Calling it
           * "self-asserted" alongside an email address would understate the
           * only claim type anybody actually checks.
           */}
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-gray-400">
            {isEncryptionKey
              ? "Checked by the node"
              : claim.verified
                ? "Marked verified by publisher"
                : "Self-asserted"}
          </span>
        </div>
      </div>

      <p className="mt-1 break-all font-mono text-xs text-white">{claim.value}</p>

      {isEncryptionKey && (
        <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
          Not a wallet key and it holds no funds. Counterparties seal your trade messages and
          payment details to this, and only your wallet can derive the private half that opens
          them — on any device, from the same wallet.
        </p>
      )}

      <p className="mt-1 text-[11px] text-gray-600">
        Published {formatDateMs(claim.createdAt)}
        {claim.expiresAt !== null && <> · expires {formatDateMs(claim.expiresAt)}</>}
        {claim.supersedes && <> · replaces {claim.supersedes}</>}
      </p>
    </li>
  );
}
