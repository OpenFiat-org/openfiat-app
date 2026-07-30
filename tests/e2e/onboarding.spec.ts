import { test, expect } from "@playwright/test";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

/**
 * Step 1 of the onboarding journey, driven through the real UI against the
 * real deployed faucet, and verified on chain.
 *
 * # Why this test exists
 *
 * The faucet page used to offer only mock USDC and USDT. A newcomer who
 * followed it got the two assets that are useless on their own: no SOL, so
 * they could not pay a transaction fee or the rent for their own token
 * accounts, and no OPEN, so they could not stake into any role. Nothing
 * failed at the faucet — they got stuck several screens later, with an
 * error that pointed nowhere near the cause.
 *
 * So the assertion that matters is not "the request succeeded". It is that
 * a wallet which has *never existed before* ends up holding all four assets.
 * A fresh keypair is generated per run for exactly that reason: an address
 * that already held a balance could pass this test while the faucet did
 * nothing at all.
 *
 * Balances are read from devnet afterwards rather than trusting the UI's
 * own success message, which is just the service's response echoed back.
 */

const DEVNET_RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const OPEN_MINT = new PublicKey("29w8TroBTYoaqrXBDcpv5L54VZRA8Kf7kU5U1cakvFdj");
const MOCK_USDC = new PublicKey("2bHPi5hA4zrmPAfrvLmEexg3KJjpTjNkUcxWnzUPeRRU");
const MOCK_USDT = new PublicKey("C4rSGhdxWhSFQuFcAxQti1JvBxriwHJoHtJjfhs5p24Y");

async function tokenBalance(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
): Promise<number> {
  // Resolved by owner+mint rather than by deriving an associated-token
  // address with an assumed token program: mock USDC/USDT are legacy SPL
  // while OPEN is Token-2022, and hardcoding either would silently report
  // zero for the other.
  const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint });
  return accounts.value.reduce(
    (sum, a) => sum + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
    0,
  );
}

test("a brand-new wallet gets SOL, USDC, USDT and OPEN through the faucet page", async ({ page }) => {
  test.setTimeout(180_000);

  // Never reused. See the header: a pre-funded address would let this pass
  // without the faucet doing anything.
  const recipient = Keypair.generate().publicKey;
  const connection = new Connection(DEVNET_RPC, "confirmed");

  expect(await connection.getBalance(recipient), "fresh wallet must start empty").toBe(0);

  await page.goto("/faucet");

  // All four must be offered. Before this was fixed the page rendered only
  // two buttons, so this is the regression guard, not decoration.
  for (const symbol of ["SOL", "mock USDC", "mock USDT", "OPEN"]) {
    await expect(
      page.getByRole("button", { name: new RegExp(symbol, "i") }),
      `faucet page must offer ${symbol}`,
    ).toBeVisible();
  }

  await page.getByPlaceholder(/devnet wallet address/i).fill(recipient.toBase58());
  await page.getByRole("button", { name: /send test tokens/i }).click();

  await expect(page.getByText(/^Sent$/)).toBeVisible({ timeout: 90_000 });

  // The UI claims success; devnet decides whether it is true.
  await expect
    .poll(async () => connection.getBalance(recipient), {
      message: "SOL never arrived — without it the wallet cannot pay fees or rent",
      timeout: 60_000,
      intervals: [2000],
    })
    .toBeGreaterThan(0);

  const [usdc, usdt, open] = await Promise.all([
    tokenBalance(connection, recipient, MOCK_USDC),
    tokenBalance(connection, recipient, MOCK_USDT),
    tokenBalance(connection, recipient, OPEN_MINT),
  ]);

  console.log(
    `recipient ${recipient.toBase58()}: SOL=${
      (await connection.getBalance(recipient)) / 1e9
    } USDC=${usdc} USDT=${usdt} OPEN=${open}`,
  );

  expect(usdc, "mock USDC").toBeGreaterThan(0);
  expect(usdt, "mock USDT").toBeGreaterThan(0);
  expect(open, "OPEN — without it no role can be staked").toBeGreaterThan(0);

  // The whole point of the 12,000 drip: it must clear the NodeOperator
  // (1,000) and Arbitrator (10,000) minimums this cluster actually enforces,
  // or onboarding cannot reach the roles it advertises.
  expect(open, "OPEN drip must clear the 10,000 arbitrator minimum").toBeGreaterThanOrEqual(10_000);
});
