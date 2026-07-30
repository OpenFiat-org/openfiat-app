import { PublicKey } from "@solana/web3.js";
import { fetchVaultsByMerchant, formatBaseUnits, shortMint, type LiveVault } from "@/lib/live-vaults";
import { fetchTokenBalances, type TokenBalance } from "@/lib/live-token-balances";
import { KNOWN_DEVNET_MINTS } from "@/lib/onchain-config";
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
 */

function label(mint: PublicKey): string {
  return KNOWN_DEVNET_MINTS.find((m) => m.address === mint.toBase58())?.label ?? "Unrecognised mint";
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

  const [vaults, balances] = await Promise.all([
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
            <BalancesTable balances={balances.b} />
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
            <VaultsTable vaults={vaults.v} />
          )}
        </div>
      </div>
    </>
  );
}

function BalancesTable({ balances }: { balances: TokenBalance[] }) {
  return (
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
            <span className="block font-medium text-gray-200">{label(b.mint)}</span>
            <span className="mt-0.5 block font-mono text-[11px] text-gray-500">{shortMint(b.mint)}</span>
          </Td>
          <Td right num className="text-gray-200">
            {formatBaseUnits(b.amount, b.decimals)}
          </Td>
        </Tr>
      ))}
    </DataTable>
  );
}

function VaultsTable({ vaults }: { vaults: LiveVault[] }) {
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
              <span className="block font-medium text-gray-200">{label(v.mint)}</span>
              <span className="mt-0.5 block font-mono text-[11px] text-gray-500">{shortMint(v.mint)}</span>
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
    </>
  );
}
