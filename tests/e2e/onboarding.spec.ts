import { test, expect } from "@playwright/test";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { createPrivateKey, sign as edSign } from "node:crypto";

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
 *
 * # The wallet is real; only the extension is not
 *
 * The faucet now issues a challenge and dispenses only against a signature
 * over it, so there is no longer an address box to type into — a grant goes
 * to the connected wallet or to nobody. The injected provider here signs with
 * the same fresh keypair using real Ed25519, in Node, so the secret never
 * enters the page. That means the faucet's signature check is genuinely
 * exercised: a client that signed the wrong bytes would be refused by the
 * service, not waved through by a stub.
 */

/** PKCS8 DER prefix for an Ed25519 private key. A Solana keyfile's first 32
 *  bytes are the seed, and this fixed header is the whole of what
 *  `createPrivateKey` needs beyond it — which is why this needs no Ed25519
 *  library the app does not already depend on. */
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

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
  const wallet = Keypair.generate();
  const recipient = wallet.publicKey;
  const connection = new Connection(DEVNET_RPC, "confirmed");

  expect(await connection.getBalance(recipient), "fresh wallet must start empty").toBe(0);

  // Signing happens in Node so the secret never reaches the page — the same
  // split the governance and stake journeys use.
  await page.exposeFunction("__e2eSign", (bytes: number[]) =>
    Array.from(
      edSign(
        null,
        Buffer.from(Uint8Array.from(bytes)),
        createPrivateKey({
          key: Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(wallet.secretKey.subarray(0, 32))]),
          format: "der",
          type: "pkcs8",
        }),
      ),
    ),
  );
  await page.addInitScript(
    ({ address }) => {
      const provider = {
        isPhantom: true,
        connect: async () => ({ publicKey: { toString: () => address } }),
        signMessage: async (message: Uint8Array) => ({
          signature: Uint8Array.from(
            await (window as unknown as { __e2eSign(b: number[]): Promise<number[]> }).__e2eSign(
              Array.from(message),
            ),
          ),
        }),
      };
      Object.defineProperty(window, "phantom", { value: { solana: provider }, writable: true });
      localStorage.setItem(
        "openfiat:wallet",
        JSON.stringify({ wallet: "Phantom", address }),
      );
    },
    { address: recipient.toBase58() },
  );

  await page.goto("/faucet");

  // All four must be offered. Before this was fixed the page rendered only
  // two buttons, so this is the regression guard, not decoration.
  for (const symbol of ["SOL", "mock USDC", "mock USDT", "OPEN"]) {
    await expect(
      page.getByRole("button", { name: new RegExp(symbol, "i") }),
      `faucet page must offer ${symbol}`,
    ).toBeVisible();
  }

  // The wallet provider clears a connection record it does not recognise when
  // it mounts, so a single write racing that mount is silently undone. Rewrite
  // until it survives several consecutive checks — the same approach the
  // governance journey uses, and for the same reason.
  await expect
    .poll(
      async () =>
        page.evaluate((address) => {
          const scope = window as unknown as { __e2eWalletHeld?: number };
          if (localStorage.getItem("openfiat:wallet")) {
            scope.__e2eWalletHeld = (scope.__e2eWalletHeld ?? 0) + 1;
          } else {
            scope.__e2eWalletHeld = 0;
            localStorage.setItem(
              "openfiat:wallet",
              JSON.stringify({ wallet: "Phantom", address }),
            );
            window.dispatchEvent(new Event("openfiat:wallet-changed"));
          }
          return scope.__e2eWalletHeld;
        }, recipient.toBase58()),
      { timeout: 20_000, intervals: [200] },
    )
    .toBeGreaterThanOrEqual(5);

  // The address is the connected wallet's, not something typed in — the
  // challenge is what removed that box, and showing the address is how a
  // user confirms where the tokens are going.
  await expect(page.getByText(recipient.toBase58(), { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /sign and send test tokens/i }).click();

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

  // The whole point of the 12,000 drip: it must clear every role minimum
  // this cluster actually enforces — the highest is NotificationProvider at
  // 5,000 — or onboarding cannot reach the roles it advertises.
  expect(open, "OPEN drip must clear the highest role minimum").toBeGreaterThanOrEqual(5_000);
});
