import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { PROVIDER_TYPES } from "@/lib/provider-display";
import { PageHero } from "@/components/page-hero";
import { Panel } from "@/components/panel";

export const metadata: Metadata = {
  title: "Register a service",
  description:
    "Register as an OpenFiat service provider — notification gateway, price oracle, snapshot provider, risk intelligence, merchant gateway or public API node. Permissionless: a signed registration event, no application and no approval.",
  alternates: { canonical: "/providers/register" },
};

/** OFS-1500 §5. What you need before you can sign a registration. */
const IDENTITY = [
  {
    label: "Wallet address",
    detail: "Signs the registration and every later update. Whoever holds this key controls the service entry.",
  },
  {
    label: "Node identity",
    detail: "The name your node publishes itself under, stable across restarts.",
  },
  {
    label: "Peer ID",
    detail: "Derived from your node's key pair. This is what a client dials, and what proves it reached you rather than someone advertising your hostname.",
  },
  {
    label: "Public key",
    detail: "Published so anyone can verify your signatures without asking you for it.",
  },
];

/** OFS-1500 §7. Exactly what a registration event carries. */
const REGISTRATION = [
  ["Service ID", "Globally unique, and permanent — changing endpoints or pricing never changes it (§8)."],
  ["Service type", "One of the registry's types. A provider may run several services, each with its own ID."],
  ["Provider identity", "The wallet, node identity, peer ID and public key above."],
  ["Network endpoints", "Where clients reach the service. Multiple endpoints are normal — one per region."],
  ["Supported protocol versions", "So a client can tell whether it can talk to you before it tries."],
  ["Geographic region", "Which regions you serve, if you want to say. Self-declared and unverified — nothing in the protocol measures where a service is, and nothing ever will: geolocating an endpoint would answer where your socket terminates, which is a different question from who you serve. Clients see it labelled as declared."],
  ["Capabilities", "What the service actually does — currency pairs for an oracle, channels for a gateway, retention for snapshots."],
  ["Branding", "A name, a sentence, a logo and a website, all optional. The logo is an IPFS CID rather than a URL, so viewers fetch it from their own access node and nobody learns who looked at your listing. Names are not exclusive: the registry will not stop someone else registering yours, so your Service ID is what identifies you."],
  ["Pricing", "If you charge. Optional, and advertised as metadata rather than enforced by the registry."],
  ["Timestamp and signature", "The event is signed and gossiped to the network. There is nothing to submit to anyone."],
];

const STEPS = [
  {
    title: "Run the service",
    body: "Stand up whatever you are offering — a Telegram gateway, an FX oracle, a snapshot host, a public API node. The registry advertises services that exist; it does not provision them.",
  },
  {
    title: "Establish your identity",
    body: "Generate the node key pair and have a wallet ready to sign with. The peer ID falls out of the key pair; the public key is published alongside it.",
  },
  {
    title: "Sign a registration event",
    body: "Assemble the fields below, sign them with your wallet, and publish. The event propagates over the gossip protocol — no registrar, no queue, no approval.",
  },
  {
    title: "Publish health updates",
    body: "Providers periodically advertise Online, Maintenance, Degraded or Offline. Clients use it to route around you when you are down — and if you stop publishing entirely, your registration expires on its own and stops appearing in discovery.",
  },
  {
    title: "Get selected",
    body: "Clients query their local registry and choose between providers on region, latency, capabilities and price. Being listed is not being used; you are competing with everyone else offering the same service.",
  },
];

export default function RegisterProviderPage() {
  return (
    <section>
      <PageHero
        variant="pulse"
        title="Register a service"
        description="The Service Registry is permissionless. Registering is a signed event you publish to the network — there is no application, no reviewer, and nobody who can refuse you. What follows is what the protocol requires, and what happens after."
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Panel title="How it works, end to end">
            <ol className="divide-y divide-white/5">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4 px-4 py-4">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 text-xs tabular-nums text-gray-400">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white">{s.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-gray-400">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="What a registration event contains">
            <dl className="divide-y divide-white/5">
              {REGISTRATION.map(([label, detail]) => (
                <div key={label} className="px-4 py-3">
                  <dt className="text-sm font-medium text-gray-200">{label}</dt>
                  <dd className="mt-0.5 text-xs leading-relaxed text-gray-500">{detail}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Identity you need first">
            <dl className="divide-y divide-white/5">
              {IDENTITY.map((f) => (
                <div key={f.label} className="px-4 py-3">
                  <dt className="text-sm font-medium text-gray-200">{f.label}</dt>
                  <dd className="mt-0.5 text-xs leading-relaxed text-gray-500">{f.detail}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title="Service types">
            <ul className="divide-y divide-white/5">
              {Object.entries(PROVIDER_TYPES).map(([type, label]) => (
                <li key={type} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="text-gray-300">{label}</span>
                  <span className="shrink-0 text-xs text-gray-600">{type}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-white/10 px-4 py-2.5 text-[11px] leading-relaxed text-gray-500">
              Governance may add types over time. A provider may run several
              services; each gets its own Service ID.
            </p>
          </Panel>

          <Panel title="No stake, no permission">
            <p className="px-4 py-3 text-xs leading-relaxed text-gray-500">
              The registry itself asks for nothing but a signature. Individual
              service specifications may require a stake — a risk intelligence
              provider whose data moves disputes has more to answer for than a
              snapshot host — but that is set by the service, not by the registry
              you are registering with.
            </p>
          </Panel>

          <Link
            href="/providers"
            className="block rounded-md border border-white/10 px-4 py-3 text-center text-sm text-gray-300 hover:border-white/25 hover:text-white"
          >
            See who is already registered
          </Link>
        </div>
      </div>
    </section>
  );
}
