"use client";

import { CopyButton } from "@/components/copy-button";
import { Panel } from "@/components/panel";
import { useCounterparties } from "@/components/counterparties/use-counterparties";
import {
  formatPeerId,
  suggested,
  tradedLabel,
  type CounterpartySummary,
} from "@/lib/counterparties";
import { formatDateShort } from "@/lib/format";
import bs58 from "bs58";

/**
 * The people you trade with, read from a live node against your own wallet.
 *
 * Everything on this screen is derived from settlements the connected wallet
 * was itself a party to. There is no lookup for anyone else's relationships,
 * by design — see `lib/counterparties.ts`.
 */
export function CounterpartiesConsole() {
  const { status, summaries, error, read } = useCounterparties();

  if (status === "no-wallet") {
    return (
      <Panel title="People you trade with">
        <p className="px-4 py-6 text-sm text-gray-400">
          Connect your wallet. There is no account to sign in to — the key that was party to your
          trades is the only thing that can read them back, and a node will not answer this
          question for any other wallet.
        </p>
      </Panel>
    );
  }

  if (status === "no-node") {
    return (
      <Panel title="People you trade with">
        <p className="px-4 py-6 text-sm text-gray-400">
          Pick a real access node in the footer. Your trading history is counted from settlements a
          live node has replicated, so the simulated selection has nothing to answer with.
        </p>
      </Panel>
    );
  }

  const regulars = suggested(summaries);

  return (
    <div className="space-y-6">
      <Panel
        title="People you trade with"
        action={
          <button
            type="button"
            onClick={read}
            disabled={status === "loading"}
            className="text-xs text-gray-400 hover:text-white disabled:text-gray-600"
          >
            {status === "loading"
              ? "Waiting for your signature…"
              : status === "loaded"
                ? "Refresh"
                : "Read my history"}
          </button>
        }
      >
        {error && <p className="px-4 py-4 text-sm text-amber-400">{error}</p>}

        {status === "ready" && !error && (
          <p className="px-4 py-6 text-sm text-gray-400">
            Reading this asks your wallet to sign a one-time challenge. That signature is how the
            node knows the history is yours — it proves you hold the key that was party to the
            trades, and it is the only way to read them.
          </p>
        )}

        {status === "loaded" && regulars.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-400">
            No completed trades on this node yet. A node only counts what it has replicated, so a
            node that joined the network recently will know about fewer of your trades than
            happened.
          </p>
        )}

        {regulars.length > 0 && (
          <ul className="divide-y divide-white/5">
            {regulars.map((summary) => (
              <CounterpartyRow key={formatPeerId(summary.counterparty)} summary={summary} />
            ))}
          </ul>
        )}
      </Panel>

      {status === "loaded" && summaries.length > regulars.length && (
        <Panel title="Started but never completed">
          <p className="px-4 pt-4 text-xs text-gray-500">
            Wallets you have opened a settlement with that never reached a release. Not a judgement
            on anyone — trades are called off for ordinary reasons — but not trading history
            either, so they are kept out of the list above.
          </p>
          <ul className="mt-2 divide-y divide-white/5">
            {summaries
              .filter((summary) => summary.trades === 0)
              .map((summary) => (
                <CounterpartyRow key={formatPeerId(summary.counterparty)} summary={summary} />
              ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function CounterpartyRow({ summary }: { summary: CounterpartySummary }) {
  const full = bs58.encode(Uint8Array.from(summary.counterparty));
  const label = tradedLabel(summary);
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
      <div>
        <p className="flex items-center gap-2 font-mono text-sm text-white">
          {formatPeerId(summary.counterparty)}
          <CopyButton value={full} />
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {label ?? "No completed trades"}
          {summary.last_traded_at !== null && (
            <> · last on {formatDateShort(new Date(summary.last_traded_at).toISOString())}</>
          )}
        </p>
      </div>
      <div className="flex items-center gap-4 text-xs tabular-nums text-gray-400">
        <Count label="trades" value={summary.trades} tone="text-white" />
        {summary.in_progress > 0 && <Count label="in progress" value={summary.in_progress} />}
        {summary.abandoned > 0 && <Count label="called off" value={summary.abandoned} />}
        {summary.disputed > 0 && (
          <Count label="disputed" value={summary.disputed} tone="text-amber-400" />
        )}
      </div>
    </li>
  );
}

function Count({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <span className="text-right">
      <span className={`block text-sm ${tone}`}>{value}</span>
      <span className="block text-[10px] uppercase tracking-wider text-gray-600">{label}</span>
    </span>
  );
}
