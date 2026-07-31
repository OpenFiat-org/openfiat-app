import bs58 from "bs58";
/**
 * Puts real, signed protocol state on the devnet cluster so every route in
 * this app has something genuine to render.
 *
 * # Why this exists
 *
 * The cluster is live and already carries advertisements, reservations,
 * trades, oracle rates and snapshots. But `getProviders`, `getSettlements`,
 * `getDisputes` and `getProposals` come back empty, and the Service Registry
 * expires an entry it has not seen a health update for (OFS-1500 §11) — so
 * the providers registered during the original devnet bring-up are simply
 * gone.
 *
 * That matters because `/providers` is already wired to live data. Without
 * seeding, "no more dummy data" would just trade fabricated rows for blank
 * tables, which is not a better proof.
 *
 * # What this is not
 *
 * Not a fixture loader. Every record here is produced by a real Ed25519
 * signature over the real payload and accepted by the node's own
 * verification path — the same path a third-party provider would use. If a
 * signature is malformed the node rejects it and this script fails, which is
 * the point: it exercises the protocol rather than writing to a database
 * behind it.
 *
 * Run against a local cluster:
 *   npx tsx scripts/seed-devnet.ts
 *   OPENFIAT_NODE_URL=http://127.0.0.1:7081 npx tsx scripts/seed-devnet.ts
 *
 * Idempotent in the sense that re-registering the same `service_id` refreshes
 * it rather than duplicating it, so this doubles as the health-update keepalive
 * during a long test session.
 */
import {
  advertisements,
  Client,
  keypairFromSeed,
  peerIdFromPublicKey,
  providers,
  type AdvertisementCreate,
  type Keypair,
  type Registration,
  type ServiceType,
} from "@openfiat/sdk";
// The one mint this app already asserts is a settlement mint on this
// deployment, imported rather than retyped so there is a single place the
// address lives. This script deliberately ships no mint-to-ticker table of
// its own: the names these advertisements read under are resolved by the
// node from the address, which is the whole point of the change that made
// `asset_mint` the field.
import { DEVNET_SETTLEMENT_MINT } from "@/lib/onchain-config";

const NODE_URL = process.env.OPENFIAT_NODE_URL ?? "http://127.0.0.1:7080";

/**
 * Deterministic seeds, so re-running produces the same identities and the
 * app's fixtures-to-live comparison stays stable across runs. Derived from a
 * label rather than random bytes for exactly that reason — a random provider
 * key every run would make `/providers/[id]` links break between runs.
 *
 * These are devnet test identities with no value attached; the seed material
 * is intentionally non-secret and in the clear.
 */
async function identityFor(
  label: string,
): Promise<{ keypair: Keypair; peerId: Uint8Array }> {
  const seed = new Uint8Array(32);
  const labelBytes = new TextEncoder().encode(`openfiat-devnet-seed:${label}`);
  // A plain fold rather than a hash: the only requirement is that distinct
  // labels give distinct seeds, and a dependency-free derivation keeps this
  // script runnable without pulling in a digest implementation.
  for (let i = 0; i < labelBytes.length; i++) {
    seed[i % 32] = (seed[i % 32] + labelBytes[i]! + i) & 0xff;
  }
  const keypair = await keypairFromSeed(seed);
  return { keypair, peerId: peerIdFromPublicKey(keypair.publicKey) };
}

interface ProviderSpec {
  label: string;
  serviceId: string;
  serviceType: ServiceType;
  endpoints: string[];
  region: string;
  capabilities: string[];
}

/**
 * One provider per directory bucket the app can display, so `/providers`
 * exercises every branch of its type mapping rather than one repeated row.
 *
 * `supported_ofs` lists the specification numbers each service actually
 * implements — a snapshot provider speaks OFS-1500 (registry) and OFS-1700
 * (snapshots), an oracle speaks OFS-1500 and OFS-2600. Filling these with a
 * uniform list would make the field decorative.
 */
/*
 * Endpoints are `localhost`, not a plausible-looking public hostname.
 *
 * These used to be `*.devnet.openfiat.test`. `.test` is reserved by
 * RFC 2606 and resolves for nobody, ever — so running this against a
 * shared node did not seed a demo, it published five services that do not
 * exist into a real signed registry, which then replicated to every node
 * and was served to users as live infrastructure with a button offering
 * to connect to one. That is worse than a fixture: it is genuine signed
 * data whose contents are invented, and it cannot be deleted, only
 * withdrawn by the key that made it.
 *
 * The registry now refuses reserved names outright
 * (`openfiat_registry::registration`), so this cannot recur. `localhost`
 * is deliberately still allowed — RFC 6761 reserves it to *mean* loopback,
 * so on the dev machine this script is meant for, these addresses are as
 * real as any other.
 *
 * If you point this at a shared node, you are registering your own laptop
 * as a public service. Don't.
 */
const PROVIDERS: ProviderSpec[] = [
  {
    label: "snapshot-eu",
    serviceId: "devnet-snapshot-eu",
    serviceType: { Infrastructure: "SnapshotProvider" },
    endpoints: ["http://localhost:7080"],
    region: "eu-west",
    capabilities: ["zstd", "incremental", "full-archival"],
  },
  {
    label: "public-api-us",
    serviceId: "devnet-public-api-us",
    serviceType: { Infrastructure: "PublicApiNode" },
    endpoints: ["http://localhost:7081"],
    region: "us-east",
    capabilities: ["json-rpc", "websocket"],
  },
  {
    label: "fx-oracle",
    serviceId: "devnet-fx-oracle",
    serviceType: { MarketData: "FxOracle" },
    endpoints: ["http://localhost:7082"],
    region: "global",
    capabilities: ["USDC/KES", "USDC/NGN", "USDC/GHS"],
  },
  {
    label: "risk-intel",
    serviceId: "devnet-risk-intel",
    serviceType: { Security: "RiskIntelligenceProvider" },
    endpoints: ["http://localhost:7083"],
    region: "global",
    capabilities: ["wallet-screening", "sanctions"],
  },
  {
    label: "notify-telegram",
    serviceId: "devnet-notify-telegram",
    serviceType: { Notifications: "Telegram" },
    endpoints: ["http://localhost:7084"],
    region: "global",
    capabilities: ["telegram"],
  },
];

const OFS_BY_TYPE: Record<string, number[]> = {
  SnapshotProvider: [1500, 1700],
  PublicApiNode: [1500, 8200],
  FxOracle: [1500, 2600],
  RiskIntelligenceProvider: [1500, 2700],
  Telegram: [1500, 2500],
};

function variantName(serviceType: ServiceType): string {
  return Object.values(serviceType)[0] as string;
}

async function seedProviders(client: Client): Promise<number> {
  let registered = 0;
  for (const spec of PROVIDERS) {
    const { keypair, peerId } = await identityFor(spec.label);
    const registration: Registration = {
      service_id: spec.serviceId,
      service_type: spec.serviceType,
      provider: bs58.encode(peerId),
      provider_public_key: bs58.encode(keypair.publicKey),
      endpoints: spec.endpoints,
      supported_ofs: OFS_BY_TYPE[variantName(spec.serviceType)] ?? [1500],
      region: spec.region,
      capabilities: spec.capabilities,
      // Left unset deliberately, and it is load-bearing: a node rejects
      // pricing with no `payout_wallet`, and these test identities have no
      // Solana address that could be paid. Absent pricing already means
      // free (OFS-4100 §9.5), so this is honest rather than a placeholder.
      pricing: null,
      payout_wallet: null,
      timestamp: Date.now(),
    };
    await providers.sendProviderRegister(client, registration, keypair);
    console.log(
      `  registered ${spec.serviceId} (${variantName(spec.serviceType)})`,
    );
    registered++;
  }
  return registered;
}

interface AdSpec {
  merchantLabel: string;
  /**
   * The mint the buyer is paid in. An advertisement names a mint and no
   * ticker (OFS-2100, after `asset_mint` replaced `asset`), because a ticker
   * on a record is a label its author chose and is connected to the token
   * the escrow moves by nothing at all.
   *
   * That applies to a seed script as much as to a merchant: writing "USDC"
   * here and settling something else is the exact failure the change closed.
   * The name these render under comes back from the node, resolved from the
   * address — this file states no symbol anywhere.
   */
  mint: string;
  fiat: string;
  direction: "Buy" | "Sell";
  /** Fiat price per unit of asset, in whole fiat units. */
  price: number;
  /**
   * Trade bounds in the ASSET, like `liquidity` — not in `fiat`.
   *
   * OFS-2100's `min_trade`/`max_trade` are `Amount`s denominated in the
   * token being escrowed. These were fiat-scale (500 – 200,000 against a
   * 4,000-unit vault), so this script was seeding a real, signed book
   * whose advertised maximum was fifty times the liquidity behind it —
   * and the app was then reading those records back as evidence its
   * screens were right.
   */
  minTrade: number;
  maxTrade: number;
  liquidity: number;
  paymentMethods: string[];
}

/**
 * A book with real spread, both directions, and more than one merchant —
 * because a single ad cannot exercise the exchange's grouping, sorting or
 * best-price selection, and those are the parts most likely to be wrong.
 *
 * Prices are near the live oracle rate the cluster already publishes for
 * USDC/KES (~129.5) rather than invented, so a floating-vs-fixed comparison
 * in the UI reads sensibly against real oracle data.
 *
 * Every ad is denominated in the same mint, and that is a narrowing this
 * accepts rather than works around. The alternative is a list of addresses
 * transcribed here from the escrow program's allowlist, which is a copy of
 * somebody else's table that goes stale the first time governance changes it
 * — and getting one wrong would seed a book advertising a token nobody can
 * be paid in. One address the app already knows is honest; several guessed
 * ones would not be.
 */
const ADS: AdSpec[] = [
  {
    merchantLabel: "merchant-nairobi",
    mint: DEVNET_SETTLEMENT_MINT,
    fiat: "KES",
    direction: "Sell",
    price: 129.8,
    minTrade: 5,
    maxTrade: 3_500,
    liquidity: 4_000,
    paymentMethods: ["M-Pesa Kenya (Safaricom)", "Equity Bank"],
  },
  {
    merchantLabel: "merchant-nairobi",
    mint: DEVNET_SETTLEMENT_MINT,
    fiat: "KES",
    direction: "Buy",
    price: 128.4,
    minTrade: 5,
    maxTrade: 2_500,
    liquidity: 3_000,
    paymentMethods: ["M-Pesa Kenya (Safaricom)"],
  },
  {
    merchantLabel: "merchant-mombasa",
    mint: DEVNET_SETTLEMENT_MINT,
    fiat: "KES",
    direction: "Sell",
    price: 130.2,
    minTrade: 10,
    maxTrade: 2_000,
    liquidity: 2_500,
    paymentMethods: ["Mpesa Pochi la Biashara", "I&M Bank"],
  },
  {
    merchantLabel: "merchant-lagos",
    mint: DEVNET_SETTLEMENT_MINT,
    fiat: "NGN",
    direction: "Sell",
    price: 1_548,
    minTrade: 20,
    maxTrade: 5_000,
    liquidity: 6_000,
    paymentMethods: ["Bank Transfer (Nigeria)", "Opay"],
  },
  {
    merchantLabel: "merchant-lagos",
    mint: DEVNET_SETTLEMENT_MINT,
    fiat: "NGN",
    direction: "Buy",
    price: 1_531,
    minTrade: 20,
    maxTrade: 4_000,
    liquidity: 5_000,
    paymentMethods: ["Bank Transfer (Nigeria)"],
  },
];

/** Two decimals for fiat and for the stablecoins used here. */
function amount(whole: number): { base_units: number; decimals: number } {
  return { base_units: Math.round(whole * 100), decimals: 2 };
}

async function seedAdvertisements(client: Client): Promise<number> {
  let created = 0;
  for (const [index, spec] of ADS.entries()) {
    const { keypair, peerId } = await identityFor(spec.merchantLabel);
    // Deterministic id so a re-run refreshes the same ad rather than growing
    // the book without bound — the exchange would otherwise fill with
    // duplicates across runs and stop resembling a real market.
    const id =
      `devnet-${spec.merchantLabel}-${spec.fiat}-${spec.direction}-${index}`.toLowerCase();
    const create: AdvertisementCreate = {
      id,
      merchant: bs58.encode(peerId),
      merchant_public_key: bs58.encode(keypair.publicKey),
      asset_mint: spec.mint,
      direction: spec.direction,
      fiat_currency: spec.fiat,
      min_trade: amount(spec.minTrade),
      max_trade: amount(spec.maxTrade),
      initial_liquidity: amount(spec.liquidity),
      pricing: { Fixed: { price: amount(spec.price) } },
      payment_methods: spec.paymentMethods,
      timestamp: Date.now(),
    };
    await advertisements.sendAdvertisementCreate(client, create, keypair);
    console.log(
      `  ${spec.direction.padEnd(4)} ${spec.mint}/${spec.fiat} @ ${spec.price} — ${id}`,
    );
    created++;
  }
  return created;
}

async function main() {
  const client = new Client({ endpoint: NODE_URL, timeoutMs: 30_000 });

  const version = await client.call<Record<string, never>, { version: string }>(
    "getVersion",
    {},
  );
  console.log(`node ${NODE_URL} — version ${version.version}\n`);

  console.log("service registry (OFS-1500):");
  const registered = await seedProviders(client);

  // Read back through the same public method the app uses, rather than
  // trusting that the sends were accepted. A registration that fails
  // verification is dropped by the node without an error on this side.
  const live = await providers.getProviders(client);
  console.log(`\n  getProviders now returns ${live.length} record(s)`);
  if (live.length < registered) {
    throw new Error(
      `registered ${registered} providers but only ${live.length} are readable — ` +
        "the node accepted fewer than were sent, so some signature or payload shape is wrong",
    );
  }
  for (const record of live) {
    console.log(`    ${record.service_id}`);
  }

  console.log("\nadvertisement book (OFS-2100):");
  const created = await seedAdvertisements(client);
  // One page, and the seed writes fewer ads than a page holds — but count
  // the whole book rather than the first page, so this check keeps meaning
  // what it says if the seed ever grows past the node's page size.
  let readable = 0;
  for await (const row of advertisements.eachAdvertisement(client)) {
    void row;
    readable += 1;
  }
  console.log(`\n  getAdvertisements now returns ${readable} ad(s)`);
  if (readable < created) {
    throw new Error(
      `created ${created} advertisements but only ${readable} are readable — ` +
        "the node accepted fewer than were sent",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
