import { PublicKey } from "@solana/web3.js";
import {
  ESCROW_PROGRAM_ID,
  escrow,
  getConnection,
  KNOWN_DEVNET_MINTS,
  type KnownMint,
} from "@/lib/onchain-config";
import {
  decodeLiquidityVault,
  LIQUIDITY_VAULT_LEN,
  type DecodedLiquidityVault,
} from "@/lib/onchain-decode";
import { isWrappedSol, WRAPPED_SOL_DECIMALS, WRAPPED_SOL_MINT } from "@/lib/vault-instructions";

/**
 * Real `LiquidityVault` accounts, read from the escrow program on Solana
 * devnet.
 *
 * # What this replaces
 *
 * `lib/data/wallet.ts` exported a `VAULTS` constant whose own doc comment
 * asserted the invariant `available + reserved + settled === total`. That
 * invariant is not the program's. On chain, `settled` counts tokens that
 * have *already left* the vault, so adding it back to a spendable balance
 * double-counts money that is gone. The fixture was internally tidy and
 * described a vault that cannot exist.
 *
 * Worse, it was the same four rows for every visitor, so `/wallet` showed a
 * funded merchant to someone with no wallet connected. Of everything in
 * this app that was mock, this was the one measured in tokens.
 *
 * # Base units, not decimals
 *
 * Every counter here is a `bigint` of raw base units, exactly as the
 * program stores it. Converting to a display quantity requires the mint's
 * `decimals`, which is why `LiveVault` carries it — a vault row that
 * assumed 6 or 9 decimals would be wrong by three orders of magnitude
 * against the other mint, silently.
 */
export interface LiveVault {
  /** The `LiquidityVault` PDA itself, for linking to an explorer. */
  address: PublicKey;
  merchant: PublicKey;
  mint: PublicKey;
  /** From the mint account. Needed to render any of the counters below. */
  decimals: number;
  /**
   * The mint's owning token program, read from the mint account rather
   * than assumed. See `lib/vault-instructions.ts` for why this is read at
   * all rather than hardcoded to Token-2022.
   */
  tokenProgram: PublicKey;
  /** Deposits minus withdrawals. Settlement never reduces it, so this is
   *  not a balance — see `DecodedLiquidityVault.total`. */
  total: bigint;
  /** Held against open reservations that have not yet been funded. */
  reserved: bigint;
  /** The only figure a new reservation or withdrawal can draw against. */
  available: bigint;
  /** Cumulative amount that completed settlement and left the vault. */
  settled: bigint;
  /** Funded into open trade escrows; not yet released or cancelled back. */
  pendingSettlement: bigint;
}

/** The mint facts a vault row cannot be rendered without. */
interface MintFacts {
  decimals: number;
  tokenProgram: PublicKey;
}

/**
 * `decimals` sits at offset 44 of both a legacy SPL Token mint and a
 * Token-2022 one — Token-2022's base mint is deliberately layout-compatible
 * and puts its extensions after byte 82. So one read works for both, and
 * the account's `owner` says which program it belongs to.
 */
const MINT_DECIMALS_OFFSET = 44;

async function fetchMintFacts(mints: PublicKey[]): Promise<Map<string, MintFacts>> {
  const facts = new Map<string, MintFacts>();
  if (mints.length === 0) return facts;
  const infos = await getConnection().getMultipleAccountsInfo(mints);
  mints.forEach((mint, i) => {
    const info = infos[i];
    if (!info || info.data.length <= MINT_DECIMALS_OFFSET) return;
    facts.set(mint.toBase58(), {
      decimals: info.data[MINT_DECIMALS_OFFSET]!,
      tokenProgram: info.owner,
    });
  });
  return facts;
}

function toLiveVault(address: PublicKey, decoded: DecodedLiquidityVault, mint: MintFacts): LiveVault {
  return {
    address,
    merchant: decoded.merchant,
    mint: decoded.mint,
    decimals: mint.decimals,
    tokenProgram: mint.tokenProgram,
    total: decoded.total,
    reserved: decoded.reserved,
    available: decoded.available,
    settled: decoded.settled,
    pendingSettlement: decoded.pendingSettlement,
  };
}

/**
 * Every liquidity vault belonging to one merchant wallet, across all mints.
 *
 * Solana has no "list PDAs by seed" query, so this is `getProgramAccounts`
 * with two filters, the same shape `lib/live-governance.ts` uses to
 * enumerate proposals. Here the discriminator filter is replaced by
 * `dataSize`: a `LiquidityVault` is the only 114-byte account the escrow
 * program allocates, and `dataSize` is cheaper for the node to satisfy than
 * a byte comparison. The `memcmp` on `merchant` at offset 8 is what makes
 * this the connected wallet's vaults rather than everyone's.
 *
 * Throws if the cluster is unreachable. Callers must render that as an
 * error, never as an empty list — "you have no vaults" and "I could not
 * ask" are different facts, and only one of them means it is safe to
 * conclude there is nothing to withdraw.
 */
export async function fetchVaultsByMerchant(merchant: PublicKey): Promise<LiveVault[]> {
  const accounts = await getConnection().getProgramAccounts(ESCROW_PROGRAM_ID, {
    filters: [
      { dataSize: LIQUIDITY_VAULT_LEN },
      { memcmp: { offset: 8, bytes: merchant.toBase58() } },
    ],
  });

  const decoded = accounts.map(({ pubkey, account }) => ({
    pubkey,
    vault: decodeLiquidityVault(account.data),
  }));
  const facts = await fetchMintFacts(decoded.map((d) => d.vault.mint));

  return decoded
    .flatMap(({ pubkey, vault }) => {
      const mint = facts.get(vault.mint.toBase58());
      // A vault whose mint account cannot be read cannot be rendered
      // truthfully — without `decimals` every counter is an unscaled
      // integer. Dropping it is better than printing a number that is
      // wrong by a factor of a million.
      return mint ? [toLiveVault(pubkey, vault, mint)] : [];
    })
    .sort((a, b) => (a.available < b.available ? 1 : a.available > b.available ? -1 : 0));
}

/** One merchant's vault for one mint, or `null` if they have never created it. */
export async function fetchVault(merchant: PublicKey, mint: PublicKey): Promise<LiveVault | null> {
  const [pda] = escrow.liquidityVaultPda(merchant, mint);
  const [vaultAccount, mintFacts] = await Promise.all([
    getConnection().getAccountInfo(pda),
    fetchMintFacts([mint]),
  ]);
  if (!vaultAccount) return null;
  const facts = mintFacts.get(mint.toBase58());
  if (!facts) throw new Error(`Mint ${mint.toBase58()} does not exist on this cluster`);
  return toLiveVault(pda, decodeLiquidityVault(vaultAccount.data), facts);
}

/**
 * Base units to a display string, exactly.
 *
 * Deliberately not `Number(raw) / 10 ** decimals`: a u64 balance can exceed
 * 2^53 and a float divide would round it. Balances are the last place to
 * accept "close enough".
 */
export function formatBaseUnits(raw: bigint, decimals: number): string {
  if (decimals === 0) return raw.toLocaleString("en-US");
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(decimals, "0");
  // Trimmed to at most 6 places so a 9-decimal mint does not render a
  // column of noise, but never rounded up into a balance you do not have.
  const shown = fraction.slice(0, 6).replace(/0+$/, "");
  return shown ? `${whole.toLocaleString("en-US")}.${shown}` : whole.toLocaleString("en-US");
}

/**
 * A display quantity to base units, exactly.
 *
 * Parses the decimal string rather than multiplying a float, for the same
 * reason as above and one more: `0.1 * 10 ** 9` is 100000000.00000001 in
 * IEEE-754, and `BigInt()` of that throws. Returns `null` for anything that
 * is not a non-negative decimal number the mint can represent — including
 * an amount with more decimal places than the mint has, which would
 * otherwise be silently truncated into a different amount than the one the
 * user typed.
 */
export function parseBaseUnits(input: string, decimals: number): bigint | null {
  const trimmed = input.trim();
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === "" || trimmed === ".") return null;
  const [whole = "", fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) return null;
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

/** Short form of a mint address, for a column that must stay narrow. */
export function shortMint(mint: PublicKey): string {
  const s = mint.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/**
 * Wrapped SOL as an option in the mint pickers.
 *
 * It is not in `KNOWN_DEVNET_MINTS` because that list is a set of addresses
 * this deployment recognises on devnet, and wSOL is not one of those: its
 * address is the same on every cluster and the escrow program ships it on
 * `DEFAULT_SETTLEMENT_MINTS` for that reason. Declaring it here also keeps
 * it beside the wrap/unwrap code that is the whole reason it is offerable
 * at all — a vault denominated in a token nobody holds would be no use
 * without it.
 *
 * `obtainable` is true and means what it says: SOL is the one asset a
 * devnet wallet can always get, by airdrop.
 */
export const NATIVE_SOL_MINT_OPTION: KnownMint = {
  address: WRAPPED_SOL_MINT.toBase58(),
  label: "SOL",
  decimals: WRAPPED_SOL_DECIMALS,
  note: "Deposited and withdrawn as plain SOL. Wrapping and unwrapping happen inside the same transaction, so no wrapped-SOL account is left behind.",
  obtainable: true,
};

/** Every mint the deposit picker offers, with SOL first — it is the only
 *  one every wallet already holds. */
export const DEPOSITABLE_MINTS: KnownMint[] = [NATIVE_SOL_MINT_OPTION, ...KNOWN_DEVNET_MINTS];

/**
 * A mint's display name, and whether this build recognises the address at
 * all.
 *
 * Shared by all three wallet screens so a wSOL vault does not read as
 * "Unrecognised mint" on one of them and as "SOL" on the next. `known` is
 * false for anything not on the list, and the caller is expected to say so
 * — a name this app invented for an address it does not know is how a
 * merchant deposits into the wrong token.
 */
export function mintLabel(mint: PublicKey): { name: string; known: boolean } {
  if (isWrappedSol(mint)) return { name: NATIVE_SOL_MINT_OPTION.label, known: true };
  const known = KNOWN_DEVNET_MINTS.find((m) => m.address === mint.toBase58());
  return { name: known?.label ?? "Unrecognised mint", known: Boolean(known) };
}
