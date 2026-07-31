import { PublicKey } from "@solana/web3.js";
import {
  fetchMintNames,
  fetchVaultsByMerchant,
  formatBaseUnits,
  nameForMint,
  shortMint,
  type LiveVault,
  type ReferenceMint,
} from "@/lib/live-vaults";
import { fetchTokenBalances, type TokenBalance } from "@/lib/live-token-balances";
import { DEFAULT_NODE_URL } from "@/lib/node-endpoint";
import { DataTable, Td, Th, Tr } from "@/components/data-table";

/**
 * The on-chain half of an explorer address page, read for whichever address
 * is in the URL.
 *
 * # What this replaced
 *
 * The page rendered `WALLET_BALANCES` and `VAULTS` — the connected-user
 * fixtures — for *any* address someone typed. Every address in the explorer
 * therefore appeared to hold the same $9,428 and the same four funded
 * vaults, including addresses that do not exist. An explorer whose answers
 * do not depend on the thing being looked up is not an explorer.
 *
 * A server component rather than a client one: an explorer page is meant to
 * be linkable and readable without a wallet, and these reads need no signer.
 *
 * # Where the mint names come from, and why not from here
 *
 * This file used to name mints itself, out of `KNOWN_DEVNET_MINTS`:
 *
 *     KNOWN_DEVNET_MINTS.find((m) => m.address === mint.toBase58())?.label
 *       ?? "Unrecognised mint"
 *
 * That list has two entries, so every other mint on devnet rendered as
 * "Unrecognised mint" — wrapped SOL included, which is a mint this network
 * settles in and holds vaults denominated in. And the one entry it did
 * answer for disagreed with the rest of the app: it calls `SK1JE…WsM` the
 * "Devnet settlement stablecoin" while the node calls that same address
 * `tUSDC`, so an advertisement row and a vault row in one interface printed
 * two different names for one token.
 *
 * Adding wSOL to that list would have been the obvious repair and the wrong
 * one — a third copy of a table governance can change, going stale on its
 * own schedule. Names come from the node now, by address, through the same
 * `getReferenceData` the rest of the app reads. See `lib/reference.ts`.
 *
 * "Unrecognised mint" is gone with it, and not only because it was usually
 * wrong. It reads as a finding about the token — as though the app had
 * looked and found something amiss — when all it ever meant was that this
 * build had no nickname for an address. The address itself is shown
 * instead: unhelpful and true beats helpful and false, which is the same
 * choice `components/asset-label.tsx` makes for advertisements.
 */

/** The node's mint phrasebook, or `null` when it could not be asked. */
type MintNames = ReferenceMint[] | null;

/**
 * A mint, named if this node names it and shown as its address if not.
 *
 * The address is always in `title`, symbol or not. It is the identity; the
 * symbol is a nickname applied to it, and a reader checking *which* USDC
 * this is should not have to leave the row.
 */
function MintCell({ mint, names }: { mint: PublicKey; names: MintNames }) {
  const naming = nameForMint(mint, names);
  const address = mint.toBase58();
  return (
    <span title={address}>
      {naming.kind === "named" && (
        <span className="block font-medium text-gray-200">{naming.symbol}</span>
      )}
      {/* Unnamed and unasked both render the address, and render it in full
          rather than truncated: with no name above it, `shortMint` would
          leave a row identifying its token by eight characters. */}
      <span
        className={
          naming.kind === "named"
            ? "mt-0.5 block font-mono text-[11px] text-gray-500"
            : "block font-mono text-[11px] text-gray-400 [overflow-wrap:anywhere]"
        }
      >
        {naming.kind === "named" ? shortMint(mint) : address}
      </span>
    </span>
  );
}

/**
 * Said once per table rather than once per row, and only when the names
 * genuinely could not be read — never when the node answered and simply had
 * no nickname for an address, which is an ordinary answer needing no notice.
 */
function NamesUnavailable() {
  return (
    <p className="mt-2 text-[11px] text-gray-600">
      Token names could not be read from an OpenFiat node, so mints are shown by address. The figures
      themselves come from Solana and are unaffected.
    </p>
  );
}

function ErrorBlock({ what, message }: { what: string; message: string }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-5">
      <p className="text-sm font-medium text-red-300">Could not read {what} from Solana devnet</p>
      <p className="mt-1 text-sm text-gray-400">
        The lookup failed. This address may hold plenty — the question simply could not be asked.
      </p>
      <p className="mt-2 font-mono text-xs text-red-400/80">{message}</p>
    </div>
  );
}

export async function AddressOnchain({ address }: { address: string }) {
  let owner: PublicKey;
  try {
    owner = new PublicKey(address);
  } catch {
    // The explorer also accepts merchant ids and other non-address strings,
    // so this is an ordinary case rather than an error.
    return (
      <p className="rounded-lg border border-white/10 bg-white/[0.02] p-5 text-sm text-gray-500">
        This is not a Solana address, so it has no on-chain balances or vaults to show.
      </p>
    );
  }

  const [names, vaults, balances] = await Promise.all([
    // The build's default node, not `nodeUrl()`: that reads localStorage
    // and there is none on the server. An explorer page is meant to be
    // linkable and to render for a reader who never opened the node
    // picker, which is the same reason this is a server component at all.
    fetchMintNames(DEFAULT_NODE_URL),
    fetchVaultsByMerchant(owner).then(
      (v) => ({ ok: true as const, v }),
      (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) }),
    ),
    fetchTokenBalances(owner).then(
      (b) => ({ ok: true as const, b }),
      (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) }),
    ),
  ]);

  return (
    <>
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Token balances</h2>
        <div className="mt-3">
          {!balances.ok ? (
            <ErrorBlock what="token accounts" message={balances.message} />
          ) : balances.b.length === 0 ? (
            <p className="text-sm text-gray-500">This address holds no SPL token accounts on devnet.</p>
          ) : (
            <BalancesTable balances={balances.b} names={names} />
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Liquidity vaults</h2>
        <div className="mt-3">
          {!vaults.ok ? (
            <ErrorBlock what="liquidity vaults" message={vaults.message} />
          ) : vaults.v.length === 0 ? (
            <p className="text-sm text-gray-500">
              This address owns no liquidity vaults in the escrow program.
            </p>
          ) : (
            <VaultsTable vaults={vaults.v} names={names} />
          )}
        </div>
      </div>
    </>
  );
}

function BalancesTable({ balances, names }: { balances: TokenBalance[]; names: MintNames }) {
  return (
    <>
    <DataTable
      head={
        <tr>
          <Th>Mint</Th>
          <Th right>Balance</Th>
        </tr>
      }
    >
      {balances.map((b) => (
        <Tr key={b.address.toBase58()}>
          <Td>
            <MintCell mint={b.mint} names={names} />
          </Td>
          <Td right num className="text-gray-200">
            {formatBaseUnits(b.amount, b.decimals)}
          </Td>
        </Tr>
      ))}
    </DataTable>
      {names === null && <NamesUnavailable />}
    </>
  );
}

function VaultsTable({ vaults, names }: { vaults: LiveVault[]; names: MintNames }) {
  return (
    <>
      <DataTable
        minWidth={760}
        head={
          <tr>
            <Th>Mint</Th>
            <Th right>Available</Th>
            <Th right>Reserved</Th>
            <Th right>Pending</Th>
            <Th right>Settled</Th>
            <Th right>Deposited − withdrawn</Th>
          </tr>
        }
      >
        {vaults.map((v) => (
          <Tr key={v.address.toBase58()}>
            <Td>
              <MintCell mint={v.mint} names={names} />
            </Td>
            <Td right num className="text-emerald-300">
              {formatBaseUnits(v.available, v.decimals)}
            </Td>
            <Td right num className="text-amber-300">
              {formatBaseUnits(v.reserved, v.decimals)}
            </Td>
            <Td right num className="text-gray-300">
              {formatBaseUnits(v.pendingSettlement, v.decimals)}
            </Td>
            <Td right num className="text-gray-500">
              {formatBaseUnits(v.settled, v.decimals)}
            </Td>
            <Td right num className="text-gray-500">
              {formatBaseUnits(v.total, v.decimals)}
            </Td>
          </Tr>
        ))}
      </DataTable>
      <p className="mt-2 text-[11px] text-gray-600">
        Only <span className="text-emerald-300">Available</span> can back a new reservation. The last column
        is the program&apos;s <code>total</code> field — deposits minus withdrawals, never reduced by
        settlement — so it is not a balance.
      </p>
      {names === null && <NamesUnavailable />}
    </>
  );
}
