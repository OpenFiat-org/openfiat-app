import { CopyButton } from "@/components/copy-button";
import { CHAIN_AGREEMENT, type ProposalChainLink } from "@/lib/live-proposals";
import { shortAddress } from "@/lib/format";

const TONE: Record<"neutral" | "good" | "warn" | "bad", string> = {
  neutral: "border-white/15 bg-white/5 text-gray-300",
  good: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  warn: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  bad: "border-red-400/30 bg-red-400/10 text-red-300",
};

/**
 * Where a proposal stands against the chain's own record of it.
 *
 * # Why this is a panel and not a line
 *
 * The verdict has six values and every one of them is a different thing to
 * tell a reader — most importantly, "the chain decided and this node has
 * not caught up" is not a disagreement, and the one variant that *is* a
 * disagreement is the one an interface showing a single record could never
 * surface. Reducing this to a tick or a cross is exactly the collapse that
 * made the two registries uncorrelated in the first place.
 *
 * # The scope of the answer, stated
 *
 * `getProposalChainLink` is a synchronous node handler holding no chain
 * client, so `agreement` reflects what this node has *adopted*, not a live
 * account read. That is why the account address is shown: a reader who
 * wants the chain's own answer can go and look, at an address they did not
 * have to derive.
 */
export function ChainLinkPanel({ link }: { link: ProposalChainLink }) {
  const verdict = CHAIN_AGREEMENT[link.agreement];

  return (
    <div className="space-y-3 px-4 py-3 text-sm">
      <span
        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE[verdict.tone]}`}
      >
        {verdict.label}
      </span>
      <p className="max-w-2xl text-xs leading-relaxed text-gray-400">{verdict.detail}</p>

      <dl className="space-y-1.5 border-t border-white/5 pt-3 text-xs">
        <Row label="On-chain proposal">
          {link.onchain_proposal_id === null ? (
            <span className="text-gray-500">None claimed</span>
          ) : (
            <span className="font-mono text-gray-300">#{link.onchain_proposal_id}</span>
          )}
        </Row>
        {link.onchain_proposal_address && (
          <Row label="Account">
            <span className="flex items-center justify-end gap-2">
              <a
                href={`https://explorer.solana.com/address/${link.onchain_proposal_address}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-gray-300 hover:text-brand-hover"
              >
                {shortAddress(link.onchain_proposal_address)}
              </a>
              <CopyButton value={link.onchain_proposal_address} />
            </span>
          </Row>
        )}
        <Row label="Join key">
          {/* The digest the on-chain half must carry, and exactly what
              `link_offchain_proposal` takes — shown so an author creating
              the chain-side record does not have to re-derive a hash that
              has to agree byte for byte. */}
          <span className="flex items-center justify-end gap-2">
            <span className="truncate font-mono text-gray-500">
              {link.offchain_id_hash.slice(0, 16)}…
            </span>
            <CopyButton value={link.offchain_id_hash} />
          </span>
        </Row>
        <Row label="Program">
          <span className="font-mono text-gray-500">{shortAddress(link.governance_program)}</span>
        </Row>
      </dl>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}
