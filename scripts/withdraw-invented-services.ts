import bs58 from "bs58";
/**
 * Withdraws the seeded service registrations whose endpoints can never
 * resolve.
 *
 * `scripts/seed-devnet.ts` registered five services pointing at
 * `*.devnet.openfiat.test`. `.test` is reserved by RFC 2606 and is
 * guaranteed never to resolve, so those were not placeholder endpoints
 * that might one day work — they were invented services, published into a
 * real signed registry and served to users as live infrastructure. The
 * directory offering a "Use" button for one is the clearest form of the
 * problem: a node nobody can ever reach, presented as a choice.
 *
 * That is worse than a fixture, because the fixture was at least
 * identifiable as one. These are genuine signed records; only their
 * contents are fabricated.
 *
 * Withdrawal, not deletion: OFS-1500 has no operator delete. A record
 * leaves the registry when the provider that created it signs a
 * `Withdrawal`, which every node then applies for itself. The seeder's
 * keys are derived from a fixed label rather than random bytes, so those
 * signatures can still be produced — which is the only reason this is
 * possible at all, and a good argument for never seeding a real registry
 * with a key nobody keeps.
 *
 *   npx tsx scripts/withdraw-invented-services.ts            # dry run
 *   npx tsx scripts/withdraw-invented-services.ts --commit
 */
import {
  Client,
  keypairFromSeed,
  peerIdFromPublicKey,
  providers,
  type Keypair,
} from "@openfiat/sdk";

const NODE_URL = process.env.OPENFIAT_NODE_URL ?? "https://openfiat.allenhark.com";

/** RFC 2606 / 6761 reserved names, which resolve for nobody, ever. */
const UNRESOLVABLE = [".test", ".invalid", ".example", ".localhost"];

/** Byte-for-byte the derivation in `seed-devnet.ts`. */
async function identityFor(label: string): Promise<Keypair> {
  const seed = new Uint8Array(32);
  const labelBytes = new TextEncoder().encode(`openfiat-devnet-seed:${label}`);
  for (let i = 0; i < labelBytes.length; i++) {
    seed[i % 32] = (seed[i % 32] + labelBytes[i]! + i) & 0xff;
  }
  return keypairFromSeed(seed);
}

/** The seeder's `service_id` → `label` pairs. */
const SEEDED: Array<{ serviceId: string; label: string }> = [
  { serviceId: "devnet-snapshot-eu", label: "snapshot-eu" },
  { serviceId: "devnet-public-api-us", label: "public-api-us" },
  { serviceId: "devnet-fx-oracle", label: "fx-oracle" },
  { serviceId: "devnet-risk-intel", label: "risk-intel" },
  { serviceId: "devnet-notify-telegram", label: "notify-telegram" },
];

function unresolvable(endpoints: string[]): boolean {
  return endpoints.some((endpoint) => {
    try {
      const host = new URL(endpoint).hostname;
      return UNRESOLVABLE.some((suffix) => host.endsWith(suffix));
    } catch {
      return false;
    }
  });
}

async function main() {
  const commit = process.argv.includes("--commit");
  const client = new Client({ endpoint: NODE_URL, timeoutMs: 15_000 });

  const live = await providers.getProviders(client);
  console.log(`registry at ${NODE_URL}: ${live.length} services\n`);

  for (const { serviceId, label } of SEEDED) {
    const record = live.find((r) => r.service_id === serviceId);
    if (!record) {
      console.log(`  ${serviceId}: already absent`);
      continue;
    }
    // Checked against the live record rather than assumed from the list
    // above: withdrawing a service that had since been re-registered with
    // a real endpoint would remove something genuine.
    if (!unresolvable(record.endpoints)) {
      console.log(`  ${serviceId}: endpoints resolve — leaving alone (${record.endpoints})`);
      continue;
    }

    const keypair = await identityFor(label);
    const peerId = peerIdFromPublicKey(keypair.publicKey);
    const providerMatches =
      JSON.stringify(Array.from(record.provider)) === JSON.stringify(Array.from(peerId));
    if (!providerMatches) {
      console.log(`  ${serviceId}: registered by a different key — cannot withdraw`);
      continue;
    }

    if (!commit) {
      console.log(`  ${serviceId}: would withdraw (${record.endpoints})`);
      continue;
    }

    await providers.sendProviderWithdraw(
      client,
      { service_id: serviceId, provider: bs58.encode(peerId), timestamp: Date.now() },
      keypair,
    );
    console.log(`  ${serviceId}: withdrawn`);
  }

  const after = await providers.getProviders(client);
  console.log(`\nregistry now: ${after.length} services`);
  for (const r of after) console.log(`  ${r.service_id} -> ${r.endpoints.join(", ")}`);
  if (!commit) console.log("\ndry run — nothing sent. Re-run with --commit.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
