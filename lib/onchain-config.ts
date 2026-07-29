import { Connection } from "@solana/web3.js";
import { onchain } from "@openfiat/sdk";

/**
 * Devnet-only for now — matches `openfiat-core/programs/devnet-addresses.json`'s
 * own `devnet_programs` block (escrow/staking/governance deployed there as
 * part of Phase 8, pulled forward from Phase 9's original schedule). This
 * app has no per-user Solana-RPC preference the way `node-preference.ts`
 * has for the OpenFiat protocol node — those are two different RPC
 * surfaces (this one talks to Solana directly for on-chain program state;
 * that one talks to an OpenFiat node's own JSON-RPC for off-chain protocol
 * state) and only the Solana one is relevant to `onchain/`.
 */
export const DEVNET_RPC_ENDPOINT = "https://api.devnet.solana.com";

/** The real Token-2022 OPEN mint deployed to devnet (see devnet-addresses.json). */
export const DEVNET_OPEN_MINT = "29w8TroBTYoaqrXBDcpv5L54VZRA8Kf7kU5U1cakvFdj";

export const { escrow, staking, governance, Role, ProposalCategory, DisputeOutcome, GOVERNANCE_PROGRAM_ID } = onchain;

let connection: Connection | null = null;

/** One shared devnet `Connection`, matching `@solana/web3.js`'s own
 *  recommendation to reuse a single instance rather than one per call. */
export function getConnection(): Connection {
  connection ??= new Connection(DEVNET_RPC_ENDPOINT, "confirmed");
  return connection;
}
