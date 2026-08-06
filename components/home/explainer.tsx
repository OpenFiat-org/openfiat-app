import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

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

export function HomeExplainer({
  asset,
  fiat,
  buying,
}: {
  asset: string;
  fiat: string;
  buying: boolean;
}) {
  const t = useTranslations("explainer");
  const prefix = buying ? "buyStep" : "sellStep";
  const marks: Array<"browse" | "pay" | "receive"> = ["browse", "pay", "receive"];
  const steps = marks.map((mark, i) => ({
    title: t(`${prefix}${i + 1}Title`, { asset, fiat }),
    body: t(`${prefix}${i + 1}Body`, { asset, fiat }),
    mark,
  }));
  const benefits = [1, 2, 3, 4, 5, 6].map((n) => ({
    title: t(`benefit${n}Title`),
    body: t(`benefit${n}Body`),
  }));

  return (
    <section className="mt-16 border-t border-white/10 pt-12">
      <h2 className="text-2xl font-semibold tracking-tight text-white">
        {t("headline", { buying: String(buying), asset, fiat })}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
        {t("intro", { buying: String(buying), asset, fiat })}
      </p>

      <ol className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="border-t border-white/10 pt-5">
            <StepMark variant={step.mark} />
            <p className="mt-3 text-sm font-semibold text-white">
              {t("stepLabel", { n: i + 1, title: step.title })}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-400">{step.body}</p>
          </li>
        ))}
      </ol>

      <h2 className="mt-14 text-2xl font-semibold tracking-tight text-white">
        {t("diffHeading")}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
        {t("diffIntro")}
      </p>

      <dl className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {benefits.map((b) => (
          <div key={b.title} className="border-t border-white/10 pt-5">
            <dt className="text-sm font-semibold text-white">{b.title}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-gray-400">{b.body}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-10 flex flex-wrap gap-6 border-t border-white/10 pt-6 text-sm">
        <Link href="/guide/buy" className="text-brand hover:text-brand-hover">
          {t("howToBuy")}
        </Link>
        <Link href="/guide/sell" className="text-brand hover:text-brand-hover">
          {t("howToSell")}
        </Link>
        <Link href="/guide/merchant" className="text-brand hover:text-brand-hover">
          {t("becomeMerchant")}
        </Link>
        <Link href="/disputes" className="text-brand hover:text-brand-hover">
          {t("howDisputes")}
        </Link>
      </div>
    </section>
  );
}
