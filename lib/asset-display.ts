import { WRAPPED_SOL_MINT } from "@/lib/vault-instructions";

/**
 * What a token is called where somebody is about to trade it.
 *
 * # One mint, and one mint only
 *
 * This is not a mint-to-ticker table and must never become one. There is
 * exactly one entry it is allowed to have, and the reason it is allowed is
 * that the relationship is not a nickname somebody chose: the SPL Token
 * program defines `NATIVE_MINT` as the wrapped form of the chain's own
 * currency, and `WRAPPED_SOL_MINT` is that constant rather than a string
 * typed out here. Every other name still comes from the node, through
 * `nameForMint` and `LiveAd.assetSymbol`, and `tests/mint-naming.test.ts`
 * pins that there is no fallback phrasebook — including for this mint.
 *
 * # Why the display layer and not the node's table
 *
 * The node's `wSOL` is right and is not changed. That symbol is a wire
 * identity as much as a label: `fetchBook`, `pair-data.ts` and the exchange
 * pills all *match* advertisements on it, `openfiat_chain::symbol_for_mint`
 * compiles the same table into every node, and two nodes disagreeing about
 * what a mint is called is a consensus problem rather than a cosmetic one.
 * Renaming it there to please a screen would put a UI decision inside the
 * protocol's matching identity, and it would have to be made in another
 * repository, on every node, at once.
 *
 * So the mapping is here, at the last step before a reader sees a word, and
 * matching keeps using the node's spelling throughout.
 *
 * # Why SOL and not wSOL, given that lying about a gas balance is expensive
 *
 * Because the wrapped form is never something a user of this app chooses to
 * hold. `lib/vault-instructions.ts` wraps and unwraps inside the same
 * transaction, so a merchant hands over SOL and gets SOL back and no wrapped
 * account survives; a trader reading a book denominated in this mint is
 * being quoted in the thing they will actually part with. Showing them
 * `wSOL` asks them to learn an implementation detail in order to recognise
 * their own currency.
 *
 * The danger is the opposite direction, and it is real: native SOL pays
 * transaction fees and wrapped SOL does not, so a *balance* labelled SOL
 * that is really a token account is a number a user will read as their gas
 * and act on. That is why this is scoped to trading surfaces — books,
 * advertisements, orders, vault liquidity — and why the wallet's own balance
 * table keeps the node's `wSOL` and states native SOL separately as the fee
 * balance. See `components/wallet/balances-panel.tsx`.
 */

/** What a trader is quoted in when an advertisement settles in wrapped SOL. */
export const NATIVE_SOL_TRADING_LABEL = "SOL";

/** Whether `address` is the native mint — base58, as records carry it. */
export function isNativeSolMintAddress(address: string): boolean {
  return address === WRAPPED_SOL_MINT.toBase58();
}

/**
 * The node's symbol for a mint, as it should be read on a trading surface.
 *
 * `null` in, `null` out: a mint the node cannot name is still unnamed, and
 * this never invents one. The only substitution it makes is the native
 * mint's, and it makes that one whether or not the node named it — the
 * address is the evidence, not the symbol.
 */
export function tradingSymbol(mintAddress: string, nodeSymbol: string | null): string | null {
  return isNativeSolMintAddress(mintAddress) ? NATIVE_SOL_TRADING_LABEL : nodeSymbol;
}
