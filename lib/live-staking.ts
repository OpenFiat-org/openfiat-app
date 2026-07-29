import type { PublicKey } from "@solana/web3.js";
import { getConnection, staking } from "@/lib/onchain-config";
import { decodeStakeAccount, decodeStakingConfig, type DecodedStakeAccount, type DecodedStakingConfig } from "@/lib/onchain-decode";

/** `null` if `initialize_staking_config` hasn't run on this cluster yet. */
export async function fetchStakingConfig(): Promise<DecodedStakingConfig | null> {
  const [pda] = staking.stakingConfigPda();
  const account = await getConnection().getAccountInfo(pda);
  return account ? decodeStakingConfig(account.data) : null;
}

/** `null` if this wallet has never called `initialize_stake_account` for `role`. */
export async function fetchStakeAccount(owner: PublicKey, role: number): Promise<DecodedStakeAccount | null> {
  const [pda] = staking.stakeAccountPda(owner, role);
  const account = await getConnection().getAccountInfo(pda);
  return account ? decodeStakeAccount(account.data) : null;
}
