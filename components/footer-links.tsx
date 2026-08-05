/**
 * What the footer points at.
 *
 * The four headings match the footer at openfiat.network, so a link added to
 * either site has an obvious home in the other: Protocol is what the system
 * is, Participate is how a person takes part, Network is what is running,
 * Community is where people talk. The site carries a fifth column, Project,
 * for pages about the project itself; this app has none, so it has no such
 * column rather than an empty one.
 *
 * Every destination has been checked. Internal hrefs each have a route under
 * `app/`; external ones were requested and answered. Nothing is listed
 * because it is planned — `tests/footer-links.test.ts` enforces both halves.
 *
 * # Labels are keys
 *
 * Each column and each translatable link carries a message key under the
 * `footer` namespace; `components/footer.tsx` renders it via `useTranslations`.
 * The platform links in Community (GitHub, Discord, Reddit) carry no key — a
 * brand name is the same in every language, and translating it would be
 * inventing a second name for it. The route, the icon, and whether a link is
 * external are language-independent and stay here.
 */

/** The public site. Deep links omit the locale; its middleware adds one. */
export const SITE_URL = "https://openfiat.network";

export type IconKey = "github" | "discussions" | "discord" | "reddit";

export type FooterLink = {
  /** Message key under the `footer` namespace, or absent for a brand name
   *  (GitHub, Discord, Reddit) that reads the same in every language. */
  labelKey?: string;
  /** Used verbatim when there is no `labelKey` — a brand/platform name. */
  label?: string;
  href: string;
  /** Leaves the app: opens in a new tab and shows an outbound arrow. */
  external?: boolean;
  /** Draws the destination's own mark before the label. */
  icon?: IconKey;
};

export const FOOTER_COLUMNS: { titleKey: string; links: FooterLink[] }[] = [
  {
    // The rules this interface obeys are written down on the site, not here.
    titleKey: "protocol",
    links: [
      { labelKey: "howItWorks", href: `${SITE_URL}/how-it-works`, external: true },
      { labelKey: "whitepaper", href: `${SITE_URL}/whitepaper`, external: true },
      { labelKey: "specifications", href: `${SITE_URL}/specs`, external: true },
      { labelKey: "documentation", href: "https://docs.openfiat.network", external: true },
      { labelKey: "trustSafety", href: `${SITE_URL}/trust`, external: true },
      { labelKey: "fees", href: `${SITE_URL}/fees`, external: true },
      { labelKey: "governance", href: "/governance" },
    ],
  },
  {
    titleKey: "participate",
    links: [
      { labelKey: "guide", href: "/guide" },
      { labelKey: "howToBuy", href: "/guide/buy" },
      { labelKey: "howToSell", href: "/guide/sell" },
      { labelKey: "becomeMerchant", href: "/guide/merchant" },
      { labelKey: "countries", href: "/countries" },
      { labelKey: "staking", href: "/staking" },
    ],
  },
  {
    titleKey: "network",
    links: [
      { labelKey: "explorer", href: "/explorer" },
      { labelKey: "nodesPeers", href: "/network" },
      // Merchants sits next to Providers, not next to the guides: both are
      // directories of who is on the network, read from the same node, and
      // someone looking for one is usually looking for the other.
      { labelKey: "merchants", href: "/merchants" },
      { labelKey: "providers", href: "/providers" },
      { labelKey: "faucet", href: "/faucet" },
      { labelKey: "runANode", href: `${SITE_URL}/run-a-node`, external: true },
    ],
  },
  {
    /**
     * Four destinations, not a row of every platform that exists. OpenFiat
     * holds no account on X, Telegram, YouTube or LinkedIn, so none is listed
     * — a footer link to a handle nobody owns is an invitation to whoever
     * registers it first.
     */
    titleKey: "community",
    links: [
      { label: "GitHub", href: "https://github.com/OpenFiat-org", external: true, icon: "github" },
      {
        labelKey: "discussions",
        href: "https://github.com/OpenFiat-org/openfiat-specs/discussions",
        external: true,
        icon: "discussions",
      },
      { label: "Discord", href: "https://discord.gg/Ybwn3PMkQ", external: true, icon: "discord" },
      { label: "Reddit", href: "https://www.reddit.com/r/openfiat/", external: true, icon: "reddit" },
    ],
  },
];
