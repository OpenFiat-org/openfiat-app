"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { CopyButton } from "@/components/copy-button";
import { Panel } from "@/components/panel";
import { formatDateMs, shortAddress } from "@/lib/format";
import {
  fetchIdentityClaims,
  inactiveReason,
  replacedClaimIds,
  type IdentityClaimRecord,
  type InactiveReason,
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
  const t = useTranslations("identity");
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
      .catch(() => !cancelled && setError(t("nodeUnreachable")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [wallet, t]);

  if (!wallet) {
    return (
      <Panel title={t("claimsTitle")}>
        <p className="px-4 py-10 text-center text-sm text-gray-500">
          {t("claimsConnect")}
        </p>
      </Panel>
    );
  }

  const replaced = claims ? replacedClaimIds(claims) : new Set<string>();

  return (
    <Panel title={t("claimsTitle")}>
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3 font-mono text-xs text-gray-500">
        {shortAddress(wallet)}
        <CopyButton value={wallet} />
      </div>

      {loading && (
        <p className="px-4 py-10 text-center text-sm text-gray-500">{t("readingNode")}</p>
      )}
      {error && <p className="px-4 py-10 text-center text-sm text-amber-300">{error}</p>}

      {claims?.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-gray-500">
          {t("noClaims")}
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
        {t("claimsFooter")}
      </p>
    </Panel>
  );
}

function ClaimRow({
  claim,
  inactive,
}: {
  claim: IdentityClaimRecord;
  inactive: InactiveReason | null;
}) {
  const t = useTranslations("identity");
  const isEncryptionKey = !claim.custom && claim.type === "EncryptionKey";
  return (
    <li className={`px-4 py-3 ${inactive ? "opacity-55" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-gray-200">
          {isEncryptionKey ? t("encryptionKey") : claim.type}
          {claim.custom && (
            <span className="ml-2 text-[11px] uppercase tracking-wider text-gray-600">{t("custom")}</span>
          )}
        </p>
        <div className="flex items-center gap-2 text-[11px]">
          {inactive && (
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-gray-400">
              {t(`inactive.${inactive}`)}
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
              ? t("checkedByNode")
              : claim.verified
                ? t("markedVerified")
                : t("selfAsserted")}
          </span>
        </div>
      </div>

      <p className="mt-1 break-all font-mono text-xs text-white">{claim.value}</p>

      {isEncryptionKey && (
        <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
          {t("encryptionKeyNote")}
        </p>
      )}

      <p className="mt-1 text-[11px] text-gray-600">
        {t("published", { date: formatDateMs(claim.createdAt) })}
        {claim.expiresAt !== null && <> · {t("expires", { date: formatDateMs(claim.expiresAt) })}</>}
        {claim.supersedes && <> · {t("replaces", { id: claim.supersedes })}</>}
      </p>
    </li>
  );
}
