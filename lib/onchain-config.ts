import { Connection } from "@solana/web3.js";
import { onchain } from "@openfiat/sdk";

import { SOLANA_RPC_URL } from "@/lib/node-endpoint";

/**
 * Where on-chain program state is read from.
 *
 * The address itself now lives in `lib/node-endpoint.ts` and is re-exported
 * here for the two callers that want it under this name. It moved because
 * the network badge is derived from it: a cluster URL declared in one module
 * and a network label declared in another are two facts that can disagree,
 * and the disagreement is invisible until someone reads "Devnet" over a
 * mainnet balance.
 *
 * This app still has no per-user Solana-RPC preference the way
 * `node-preference.ts` has for the OpenFiat protocol node — those remain two
 * different RPC surfaces (this one talks to Solana directly for on-chain
 * program state; that one talks to an OpenFiat node's own JSON-RPC for
 * off-chain protocol state) and only the Solana one is relevant to
 * `onchain/`. Sharing a module is not sharing a connection.
 *
 * The addresses below are still devnet-only, matching
 * `openfiat-core/programs/devnet-addresses.json`'s `devnet_programs` block:
 * pointing `NEXT_PUBLIC_SOLANA_RPC_URL` at another cluster does not make the
 * programs exist there, which is why the badge says which cluster it found
 * rather than assuming the deployment is coherent.
 */
export const SOLANA_RPC_ENDPOINT = SOLANA_RPC_URL;

/**
 * The OPEN mint — the protocol's own token, and genesis identity: every
 * vault, treasury and stake account in the protocol is denominated in it.
 *
 * # This is a transcription, and it should not have to be
 *
 * The authority for this address is `openfiat-core`'s
 * `crates/chain/src/programs.rs`, where `IDS.mint` pins it as protocol
 * identity alongside the program ids — the same class of value as a PDA
 * seed, deliberately made compile-time in task #105 so no operator can
 * point a build at a token they minted themselves. It is recorded in
 * `programs/devnet-addresses.json` (`devnet_programs.mint`) and asserted
 * against that record by a test there.
 *
 * `@openfiat/sdk` exports the three program ids from that same pinning
 * (`ESCROW_PROGRAM_ID` and friends in `onchain/constants.ts`) and does
 * **not** export this one. So the line below is a hand copy of a constant
 * that exists precisely so it would not be hand-copied, and a transposed
 * character here would point the deposit form at nothing. Sourcing it from
 * the SDK is a real gap and is filed rather than papered over; it is not
 * fixable from this repository.
 */
export const DEVNET_OPEN_MINT = "29w8TroBTYoaqrXBDcpv5L54VZRA8Kf7kU5U1cakvFdj";

/**
 * What the protocol's own token is called.
 *
 * The one name in this app that is not the node's to give, and the reason
 * is specific rather than an exception carved out for convenience: the node
 * deliberately refuses to name this mint. `openfiat_chain::mints` has a test
 * asserting OPEN never appears in its table, because that table is a
 * phrasebook of *settlement* mints and the escrow program holds OPEN off the
 * allowlist until the public sale. Its absence there is correct and will not
 * change when governance next updates the list.
 *
 * Note the asymmetry with wSOL, and keep it legible. wSOL's *address* is the
 * same on every cluster and its name is a node's to give. OPEN is the
 * reverse: the name is universal — the protocol's token is OPEN wherever it
 * is deployed — while `DEVNET_OPEN_MINT` above is cluster-specific, and
 * `devnet-addresses.json` records a different `mint` for localnet. So this
 * constant travels and that one does not.
 *
 * A bare string, not a `label` on an address-keyed record. The shape that
 * went wrong everywhere else in this app was a name sitting on an address,
 * and `tests/exchange-assets.test.tsx` now refuses it.
 */
export const PROTOCOL_TOKEN_NAME = "OPEN";

/** The devnet settlement stablecoin the escrow program's own fee treasuries
 *  are denominated in (see `devnet_programs.feeConfigTreasuryAtas`). The
 *  node names this address `tUSDC`; this app does not name it at all. */
export const DEVNET_SETTLEMENT_MINT = "SK1JEbfsjjTG2WELNirmM7iJVcdnwerqfF32kCnoWsM";

/**
 * A mint the vault forms offer as a quick-fill.
 *
 * # It used to carry a name, and that was two questions in one table
 *
 * This type had a `label`, and `KNOWN_DEVNET_MINTS` was read as a naming
 * table by four screens. Those are two different questions and only one of
 * them is this app's:
 *
 * 1. *What is this address called?* The node answers that, from the mint
 *    table every node compiles in identically, over `getReferenceData`.
 *    Answering it here produced an app that disagreed with itself: this
 *    file called `SK1JE…WsM` the "Devnet settlement stablecoin" while the
 *    node calls it `tUSDC` and `devnet-addresses.json` calls it `usdcMint`,
 *    so which name a reader saw depended on which screen they were on. It
 *    also meant every address absent from these two entries rendered as
 *    "Unrecognised mint" — wrapped SOL included, a mint this network
 *    settles in and holds vaults denominated in.
 * 2. *What should the deposit picker offer, and what can a tester actually
 *    do with each?* That is genuinely this app's, it needs `note` and
 *    `obtainable`, which no node publishes, and it needs OPEN, which the
 *    node deliberately never names — the escrow program holds it off the
 *    settlement allowlist until the public sale (see `openCarveOut` in
 *    `devnet-addresses.json`), so a phrasebook of settlement mints is the
 *    wrong place to look for it and its absence there is correct.
 *
 * So the name is gone from this type and the rest stayed. What is left
 * cannot be wrong about an identity, because it no longer claims one:
 * `nameForMint` in `lib/live-vaults.ts` is the single place an address
 * becomes a name.
 */
export interface OfferedMint {
  address: string;
  /**
   * Kept here rather than read from the node, because a picker needs it
   * before any round trip and because the node cannot supply it for OPEN.
   * It is a fact about the mint account on chain, not a label.
   */
  decimals: number;
  /** Shown verbatim in the picker. States what you can actually do with it. */
  note: string;
  /** `false` when no wallet can obtain any, so the UI can say so up front. */
  obtainable: boolean;
}

/**
 * The devnet mints the vault forms offer without being asked.
 *
 * Deliberately short, and deliberately not a list of every mint that
 * exists: a merchant can type any address into the same form, because the
 * settlement allowlist is on chain and governance-updatable and a client
 * enforcing a stale copy would refuse deposits the protocol allows.
 */
export const OFFERED_DEVNET_MINTS: OfferedMint[] = [
  {
    address: DEVNET_SETTLEMENT_MINT,
    decimals: 6,
    note: "The mint the escrow fee treasuries are denominated in. Test tokens with no value.",
    obtainable: true,
  },
  {
    address: DEVNET_OPEN_MINT,
    decimals: 9,
    note: "This mint's authority is permanently unset — no more can ever be issued, so a wallet holding none can never obtain any on devnet.",
    obtainable: false,
  },
];

export const {
  escrow,
  staking,
  governance,
  Role,
  ProposalCategory,
  DisputeOutcome,
  ESCROW_PROGRAM_ID,
  GOVERNANCE_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} = onchain;

let connection: Connection | null = null;

/** One shared devnet `Connection`, matching `@solana/web3.js`'s own
 *  recommendation to reuse a single instance rather than one per call. */
export function getConnection(): Connection {
  connection ??= new Connection(SOLANA_RPC_ENDPOINT, "confirmed");
  return connection;
}
