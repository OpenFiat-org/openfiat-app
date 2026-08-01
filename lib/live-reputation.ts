import { Client } from "@openfiat/sdk";
import { nodeUrl } from "@/lib/node-endpoint";
import { peerIdParam, walletParam } from "@/lib/wallet-param";

/**
 * Reputation as the protocol actually records it.
 *
 * # What this replaced
 *
 * `lib/data/identity.ts`'s `REPUTATION`: a fixture presenting the reader's
 * own profile as "Professional" tier, 72% of the way to "Elite", with
 * 412,000 USDT lifetime volume, a 98.6% success rate and eight scored
 * dimensions. Every number was invented, and it was shown to whoever was
 * looking — including a wallet that had never traded. A reader had no way
 * to tell it apart from a real profile, which is the whole problem.
 *
 * # Why there are no scores or tiers here
 *
 * The node returns counters, not scores: trades started, completed and
 * cancelled, disputes involved and lost, payment discrepancies, response
 * latency sums. OFS-3000's reputation is deliberately objective and
 * wallet-bound — there are no star ratings and no tiers in the protocol at
 * all. The fixture's "Professional / Elite" ladder and 0-100 dimension
 * scores were a presentation invented on top of nothing.
 *
 * Rather than invent a scoring function here and pass it off as protocol
 * output, this exposes the counters and the few ratios that follow directly
 * from them, and says plainly when a wallet has no history.
 */

/** Raw counters as returned by `getReputation`. Snake-case is the wire shape. */
interface RawReputation {
  trades_started: number;
  trades_completed: number;
  trades_cancelled: number;
  disputes_involved: number;
  disputes_lost: number;
  payments_submitted: number;
  payment_discrepancies: number;
  payment_responses_due: number;
  payment_responses_made: number;
  reservations_missed: number;
  completed_duration_sum_ms: number;
  response_latency_sum_ms: number;
  first_active_at: number | null;
}

export interface LiveReputation {
  tradesStarted: number;
  tradesCompleted: number;
  tradesCancelled: number;
  disputesInvolved: number;
  disputesLost: number;
  paymentsSubmitted: number;
  paymentDiscrepancies: number;
  reservationsMissed: number;
  firstActiveAt: number | null;
  /** `null` when no trade has been started — a rate over zero is undefined,
   *  not 0% and not 100%. */
  completionRate: number | null;
  /** `null` when no trade has completed. */
  medianSettlementMs: number | null;
  /** `null` when nothing has been responded to. */
  responseRate: number | null;
  /**
   * OFS-3000 §13: mean milliseconds from a buyer declaring payment to this
   * wallet approving or rejecting it, averaged over responses actually made.
   *
   * This is the one "response time" the protocol genuinely measures, and it is
   * measured rather than declared — both endpoints are timestamps on signed
   * events that every node already replicates, which is why `crates/reputation`
   * can compute it without a new event type. It is not a merchant's advertised
   * turnaround, and it is `null` rather than optimistic when there is nothing
   * to average: an unanswered declaration has no latency and is already counted
   * against `responseRate`.
   */
  meanResponseMs: number | null;
  /** True when this wallet has done nothing the protocol records. */
  empty: boolean;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function toLiveReputation(raw: RawReputation): LiveReputation {
  const started = raw.trades_started ?? 0;
  const completed = raw.trades_completed ?? 0;
  return {
    tradesStarted: started,
    tradesCompleted: completed,
    tradesCancelled: raw.trades_cancelled ?? 0,
    disputesInvolved: raw.disputes_involved ?? 0,
    disputesLost: raw.disputes_lost ?? 0,
    paymentsSubmitted: raw.payments_submitted ?? 0,
    paymentDiscrepancies: raw.payment_discrepancies ?? 0,
    reservationsMissed: raw.reservations_missed ?? 0,
    firstActiveAt: raw.first_active_at ?? null,
    completionRate: ratio(completed, started),
    // A mean, and named as one: the node returns a sum and a count, which
    // cannot yield a true median. Calling it "median" — as the fixture did
    // ("median 6 min") — would be a different number wearing the same label.
    medianSettlementMs:
      completed > 0 ? Math.round((raw.completed_duration_sum_ms ?? 0) / completed) : null,
    responseRate: ratio(raw.payment_responses_made ?? 0, raw.payment_responses_due ?? 0),
    meanResponseMs:
      (raw.payment_responses_made ?? 0) > 0
        ? Math.round((raw.response_latency_sum_ms ?? 0) / (raw.payment_responses_made ?? 1))
        : null,
    empty:
      started === 0 &&
      completed === 0 &&
      (raw.disputes_involved ?? 0) === 0 &&
      (raw.payments_submitted ?? 0) === 0,
  };
}

async function read(walletArgument: string): Promise<LiveReputation> {
  const client = new Client({ endpoint: nodeUrl(), timeoutMs: 8_000 });
  const raw = await client.call<{ wallet: string }, RawReputation>("getReputation", {
    wallet: walletArgument,
  });
  return toLiveReputation(raw);
}

/** Reads a wallet's reputation from the selected node, by base58 address. */
export async function fetchReputation(wallet: string): Promise<LiveReputation> {
  return read(walletParam(wallet));
}

/**
 * The same read, for a wallet known only by its PeerId.
 *
 * Everything the protocol replicates about a counterparty names them by PeerId
 * — an advertisement carries `merchant`, a settlement carries `buyer` and
 * `seller` — and never by the base58 address a person types. `walletParam`
 * derives one from the other and cannot be run backwards, so a caller holding a
 * PeerId has no address to give it.
 *
 * The base58 spelling is the one `lib/live-advertisements.ts` puts on every
 * row, so callers pass through what they already display. `peerIdParam` owns
 * the encoding and the argument for it, including why passing the wrong
 * spelling is worse than an error here.
 */
export async function fetchReputationForPeerId(peerId: string): Promise<LiveReputation> {
  return read(peerIdParam(peerId));
}
