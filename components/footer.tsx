import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

import { NodeChip } from "@/components/access-node";
import { FOOTER_ICONS } from "@/components/footer-icons";
import { FOOTER_COLUMNS, SITE_URL, type FooterLink } from "@/components/footer-links";
import { NETWORK_LABEL, SOLANA_CLUSTER, TOKENS_ARE_WORTHLESS } from "@/lib/node-endpoint";

const linkClass =
  "inline-flex items-center gap-2 rounded-sm text-sm text-gray-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70";

/** The same micro-label the nav uses for its mega-menu sections. */
const headingClass = "text-xs font-semibold uppercase tracking-wider text-gray-400";

function FooterLinkItem({ link, label }: { link: FooterLink; label: string }) {
  const Icon = link.icon ? FOOTER_ICONS[link.icon] : null;

  const body = (
    <>
      {Icon && <Icon />}
      <span>{label}</span>
      {link.external && (
        <span aria-hidden="true" className="text-gray-600">
          ↗
        </span>
      )}
    </>
  );

  return (
    <li>
      {link.external ? (
        <a href={link.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {body}
        </a>
      ) : (
        <Link href={link.href} className={linkClass}>
          {body}
        </Link>
      )}
    </li>
  );
}

/**
 * Four columns of links, then a baseline bar carrying the one disclaimer that
 * is true on every route and the node this interface is actually talking to.
 *
 * The links used to be a single flat row, which stopped being readable at
 * exactly the width where it started being useful. Grouping them means adding
 * one is an entry in `components/footer-links.tsx` and no layout change.
 *
 * The copy above them once read "Simulated data, not connected to a live
 * node" on every page. It was wrong in both directions at once: false on the
 * routes that read a real node and real Solana accounts, and an alibi for the
 * ones that were still serving fixtures. A blanket disclaimer cannot describe
 * a mixed app, and a reader cannot tell which half they are looking at. What
 * is left states the one thing true everywhere — this is devnet, so nothing
 * here is worth anything — and leaves provenance to each route.
 */
export async function Footer() {
  const t = await getTranslations("footer");
  return (
    <footer className="mt-16 border-t border-white/10">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="flex flex-col gap-10 lg:flex-row lg:gap-14">
          <div className="lg:w-64 lg:shrink-0">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <Image
                src="/logo-mark.png"
                alt=""
                width={26}
                height={26}
                className="h-[26px] w-[26px]"
              />
              <span className="text-base font-semibold text-white">OpenFiat</span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-gray-500">{t("tagline")}</p>
            <a
              href={SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-3 ${linkClass}`}
            >
              openfiat.network
              <span aria-hidden="true" className="text-gray-600">
                ↗
              </span>
            </a>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
            {FOOTER_COLUMNS.map((column) => {
              const headingId = `footer-${column.titleKey}`;
              return (
                <nav key={column.titleKey} aria-labelledby={headingId} className="min-w-0">
                  <h2 id={headingId} className={headingClass}>
                    {t(column.titleKey)}
                  </h2>
                  <ul className="mt-4 space-y-2.5">
                    {column.links.map((link) => (
                      <FooterLinkItem
                        key={link.href}
                        link={link}
                        label={link.labelKey ? t(link.labelKey) : (link.label ?? "")}
                      />
                    ))}
                  </ul>
                </nav>
              );
            })}
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5">
          <p className="text-xs text-gray-500">
            © 2026 OpenFiat — {t("protocolLine")}.{" "}
            {t("runningOn", { network: NETWORK_LABEL, cluster: SOLANA_CLUSTER })}
            {TOKENS_ARE_WORTHLESS ? `; ${t("noValue")}.` : "."}
          </p>
          <NodeChip />
        </div>
      </div>
    </footer>
  );
}
