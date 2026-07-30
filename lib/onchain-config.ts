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

/** The real Token-2022 OPEN mint deployed to devnet (see devnet-addresses.json). */
export const DEVNET_OPEN_MINT = "29w8TroBTYoaqrXBDcpv5L54VZRA8Kf7kU5U1cakvFdj";

/** The devnet settlement stablecoin the escrow program's own fee treasuries
 *  are denominated in (see `devnet_programs.feeConfigTreasuryAtas`). */
export const DEVNET_SETTLEMENT_MINT = "SK1JEbfsjjTG2WELNirmM7iJVcdnwerqfF32kCnoWsM";

/**
 * A mint a vault can be opened against, offered by name in the deposit and
 * withdraw forms.
 *
 * Neither mint carries on-chain Token-2022 metadata, so neither has a
 * symbol the chain will tell you — every name below is this app's label for
 * an address, which is why the address is always shown beside it. A vault
 * screen that showed "USDC" for a mint that is not USDC would be the same
 * class of error as the fixture this replaced.
 */
export interface KnownMint {
  address: string;
  label: string;
  decimals: number;
  /** Shown verbatim in the picker. States what you can actually do with it. */
  note: string;
  /** `false` when no wallet can obtain any, so the UI can say so up front. */
  obtainable: boolean;
}

/**
 * The devnet mints worth naming. Deliberately short, and deliberately does
 * NOT include entries for USDT/USDC/USD1: no devnet mint is mapped to those
 * symbols anywhere in this deployment, and inventing an address for a
 * familiar ticker is how a merchant deposits into the wrong token.
 */
export const KNOWN_DEVNET_MINTS: KnownMint[] = [
  {
    address: DEVNET_SETTLEMENT_MINT,
    label: "Devnet settlement stablecoin",
    decimals: 6,
    note: "The mint the escrow fee treasuries are denominated in. Test tokens with no value.",
    obtainable: true,
  },
  {
    address: DEVNET_OPEN_MINT,
    label: "OPEN",
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
