import { Link } from "@/i18n/navigation";

/**
 * The explainer below the order book: how a trade works, then what is actually
 * different about this one.
 *
 * The reference for the shape is Bybit's three-step strip, but the content is
 * deliberately not theirs. Their benefits list — lower fees, 24/7, choose your
 * payment method — is true of any P2P desk and says nothing about a protocol
 * with no operator. The claims below are ones a centralised exchange cannot
 * make, which is the only reason to write them down.
 *
 * Illustrations are inline SVG. Three small marks do not justify a stock-art
 * dependency, a font subset, or a network request per icon.
 */

function StepMark({ variant }: { variant: "browse" | "pay" | "receive" }) {
  const stroke = "#2b8fff";
  const teal = "#00b098";
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
      {variant === "browse" && (
        <>
          <rect x="4" y="8" width="36" height="8" rx="2" stroke={stroke} strokeWidth="1.5" />
          <rect x="4" y="20" width="36" height="8" rx="2" stroke={stroke} strokeWidth="1.5" opacity="0.55" />
          <rect x="4" y="32" width="22" height="8" rx="2" stroke={stroke} strokeWidth="1.5" opacity="0.3" />
          <circle cx="34" cy="24" r="4" fill={teal} opacity="0.9" />
        </>
      )}
      {variant === "pay" && (
        <>
          {/* A padlock over a rail: escrow closing before money moves. */}
          <rect x="12" y="20" width="20" height="16" rx="3" stroke={stroke} strokeWidth="1.5" />
          <path d="M17 20v-4a5 5 0 0110 0v4" stroke={teal} strokeWidth="1.5" />
          <circle cx="22" cy="28" r="2.5" fill={teal} />
        </>
      )}
      {variant === "receive" && (
        <>
          <path d="M6 22h24" stroke={stroke} strokeWidth="1.5" />
          <path d="M24 15l7 7-7 7" stroke={stroke} strokeWidth="1.5" />
          <circle cx="35" cy="22" r="5" stroke={teal} strokeWidth="1.5" />
          <path d="M33 22l1.6 1.6L37 21" stroke={teal} strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

const BENEFITS: Array<[string, string]> = [
  [
    "Nobody holds your fiat",
    "The money goes straight from your account to your counterparty's. There is no platform balance to freeze, and no company between you that could fail while holding it.",
  ],
  [
    "Escrow is a program, not a promise",
    "The crypto sits in a Solana escrow program that releases on the outcome. Not on an operator's decision, and not on ours — we could not release it early if we wanted to.",
  ],
  [
    "Merchants have something to lose",
    "Every advertiser has bonded OPEN that a lost dispute can slash, and eight reputation dimensions that move on every trade. That is what stands behind a stranger, in place of a company's guarantee.",
  ],
  [
    "Disputes are decided by staked strangers",
    "Independent arbitrators stake OPEN to join a case, review evidence they cannot see until they commit, and vote by commit-and-reveal. No support queue, and no operator with a final say.",
  ],
  [
    "Local rails, including cash",
    "Mobile money, instant bank transfer and the payment apps people actually use, in every country — plus cash, which works where nothing electronic does.",
  ],
  [
    "Nobody can shut a market",
    "The order book lives on a peer-to-peer network, not on a server we own. There is no operator to lean on and no jurisdiction that switches it off.",
  ],
];

export function HomeExplainer({
  asset,
  fiat,
  buying,
}: {
  asset: string;
  fiat: string;
  buying: boolean;
}) {
  const steps: Array<[string, string, "browse" | "pay" | "receive"]> = buying
    ? [
        [
          "Pick an advertiser",
          `Compare price, limits and reputation in the ${asset}/${fiat} book above, then open the order form on the row you want. Nothing is committed until you confirm.`,
          "browse",
        ],
        [
          `Send the ${fiat}`,
          `The ${asset} locks in escrow before you pay anything. Send the ${fiat} using the details shown, then mark it paid — with your receipt attached, which is what an arbitrator reads if it goes wrong.`,
          "pay",
        ],
        [
          `Receive the ${asset}`,
          "The merchant confirms the money arrived and escrow releases to your wallet. If they do not confirm, you open a dispute and staked arbitrators decide it.",
          "receive",
        ],
      ]
    : [
        [
          "Pick a buyer",
          `Compare what buyers are paying for ${asset} in ${fiat}, check their reputation, and open the order form on the row you want.`,
          "browse",
        ],
        [
          "Your crypto goes into escrow",
          `The ${asset} moves into the Solana escrow program when the order opens, so the buyer can see it is guaranteed. Nominate the account you want the ${fiat} sent to.`,
          "pay",
        ],
        [
          "Confirm and release",
          `Check the ${fiat} in your own account — never a screenshot — then release. Escrow sends the ${asset} to the buyer and both reputations update.`,
          "receive",
        ],
      ];

  return (
    <section className="mt-16 border-t border-white/10 pt-12">
      <h2 className="text-2xl font-semibold tracking-tight text-white">
        {buying ? `Buy ${asset} with ${fiat} in 3 steps` : `Sell ${asset} for ${fiat} in 3 steps`}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
        {buying
          ? `Your ${asset} is locked before you send a single ${fiat}. Here is the whole sequence.`
          : `Your ${asset} is locked the moment the order opens, so the buyer knows it is there. Here is the whole sequence.`}
      </p>

      <ol className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-3">
        {steps.map(([title, body, mark], i) => (
          <li key={title} className="border-t border-white/10 pt-5">
            <StepMark variant={mark} />
            <p className="mt-3 text-sm font-semibold text-white">
              Step {i + 1}: {title}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-400">{body}</p>
          </li>
        ))}
      </ol>

      <h2 className="mt-14 text-2xl font-semibold tracking-tight text-white">
        What is different here
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
        Lower fees and 24/7 trading are true of every peer-to-peer desk. These are the things a
        centralised exchange cannot say.
      </p>

      <dl className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map(([title, body]) => (
          <div key={title} className="border-t border-white/10 pt-5">
            <dt className="text-sm font-semibold text-white">{title}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-gray-400">{body}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-10 flex flex-wrap gap-6 border-t border-white/10 pt-6 text-sm">
        <Link href="/guide/buy" className="text-brand hover:text-brand-hover">
          How to buy →
        </Link>
        <Link href="/guide/sell" className="text-brand hover:text-brand-hover">
          How to sell →
        </Link>
        <Link href="/guide/merchant" className="text-brand hover:text-brand-hover">
          Become a merchant →
        </Link>
        <Link href="/disputes" className="text-brand hover:text-brand-hover">
          How disputes work →
        </Link>
      </div>
    </section>
  );
}
