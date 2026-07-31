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
 */

/** The public site. Deep links omit the locale; its middleware adds one. */
export const SITE_URL = "https://openfiat.network";

export type IconKey = "github" | "discussions" | "discord" | "reddit";

export type FooterLink = {
  label: string;
  href: string;
  /** Leaves the app: opens in a new tab and shows an outbound arrow. */
  external?: boolean;
  /** Draws the destination's own mark before the label. */
  icon?: IconKey;
};

export const FOOTER_COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    // The rules this interface obeys are written down on the site, not here.
    title: "Protocol",
    links: [
      { label: "How it works", href: `${SITE_URL}/how-it-works`, external: true },
      { label: "Whitepaper", href: `${SITE_URL}/whitepaper`, external: true },
      { label: "Specifications", href: `${SITE_URL}/specs`, external: true },
      { label: "Documentation", href: "https://docs.openfiat.network", external: true },
      { label: "Trust & safety", href: `${SITE_URL}/trust`, external: true },
      { label: "Fees", href: `${SITE_URL}/fees`, external: true },
      { label: "Governance", href: "/governance" },
    ],
  },
  {
    title: "Participate",
    links: [
      { label: "Guide", href: "/guide" },
      { label: "How to buy", href: "/guide/buy" },
      { label: "How to sell", href: "/guide/sell" },
      { label: "Become a merchant", href: "/guide/merchant" },
      { label: "Countries", href: "/countries" },
      { label: "Staking", href: "/staking" },
    ],
  },
  {
    title: "Network",
    links: [
      { label: "Explorer", href: "/explorer" },
      { label: "Nodes & peers", href: "/network" },
      // Merchants sits next to Providers, not next to the guides: both are
      // directories of who is on the network, read from the same node, and
      // someone looking for one is usually looking for the other.
      { label: "Merchants", href: "/merchants" },
      { label: "Providers", href: "/providers" },
      { label: "Faucet", href: "/faucet" },
      { label: "Run a node", href: `${SITE_URL}/run-a-node`, external: true },
    ],
  },
  {
    /**
     * Four destinations, not a row of every platform that exists. OpenFiat
     * holds no account on X, Telegram, YouTube or LinkedIn, so none is listed
     * — a footer link to a handle nobody owns is an invitation to whoever
     * registers it first.
     */
    title: "Community",
    links: [
      {
        label: "GitHub",
        href: "https://github.com/OpenFiat-org",
        external: true,
        icon: "github",
      },
      {
        label: "Discussions",
        href: "https://github.com/OpenFiat-org/openfiat-specs/discussions",
        external: true,
        icon: "discussions",
      },
      {
        label: "Discord",
        href: "https://discord.gg/Ybwn3PMkQ",
        external: true,
        icon: "discord",
      },
      {
        label: "Reddit",
        href: "https://www.reddit.com/r/openfiat/",
        external: true,
        icon: "reddit",
      },
    ],
  },
];
