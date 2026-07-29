import bs58 from "bs58";
import { GOVERNANCE_PROGRAM_ID, getConnection, governance } from "@/lib/onchain-config";
import { decodeGovernanceConfig, decodeProposal, type DecodedGovernanceConfig, type DecodedProposal } from "@/lib/onchain-decode";

const PROPOSAL_DISCRIMINATOR = Uint8Array.from([26, 94, 189, 187, 116, 136, 53, 33]);

/** `null` if `initialize_governance_config` hasn't run on this cluster yet. */
export async function fetchGovernanceConfig(): Promise<DecodedGovernanceConfig | null> {
  const [pda] = governance.governanceConfigPda();
  const account = await getConnection().getAccountInfo(pda);
  return account ? decodeGovernanceConfig(account.data) : null;
}

/**
 * Every `Proposal` account live on-chain, newest first. Solana has no
 * "list accounts by seed pattern" query — `getProgramAccounts` with a
 * `memcmp` filter on the account discriminator (offset 0) is the
 * standard way to enumerate every account of one type under a program,
 * without needing to already know which numeric ids exist.
 */
export async function fetchAllProposals(): Promise<DecodedProposal[]> {
  const accounts = await getConnection().getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(PROPOSAL_DISCRIMINATOR) } }],
  });
  return accounts
    .map(({ account }) => decodeProposal(account.data))
    .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

export async function fetchProposal(id: bigint): Promise<DecodedProposal | null> {
  const [pda] = governance.proposalPda(id);
  const account = await getConnection().getAccountInfo(pda);
  return account ? decodeProposal(account.data) : null;
}
