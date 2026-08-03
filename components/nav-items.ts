/**
 * The navigation's destinations, shared by the desktop mega-menus in
 * `components/top-nav.tsx` and the mobile sheet in
 * `components/mobile-nav.tsx`.
 *
 * Shared rather than duplicated because the two are meant to be the same
 * site. A phone that offers a subset of the routes a laptop offers is a
 * different product with the same logo, and the way that happens is somebody
 * adds a route to one list and not the other.
 */

export interface NavItem {
  label: string;
  href: string;
  /**
   * The glyph shown in the item's square marker. Typographic, not an icon
   * font or an SVG set: it is the one visual device this nav has of its own,
   * and it costs nothing to load.
   */
  marker: string;
  description: string;
}

export interface MenuSection {
  title?: string;
  items: NavItem[];
}

/** Top-level market surfaces. Public, and usable without a wallet. */
export const MAIN_LINKS: Array<[string, string]> = [
  ["P2P Exchange", "/"],
  ["Countries", "/countries"],
  ["Disputes", "/disputes"],
  ["Governance", "/governance"],
];

export const ECOSYSTEM_MENU: MenuSection[] = [
  {
    items: [
      { label: "Explorer", href: "/explorer", marker: "⌕", description: "Search addresses, trades & protocol events" },
      { label: "Network", href: "/network", marker: "⛁", description: "Nodes, peers & event stream" },
      { label: "Providers", href: "/providers", marker: "⚡", description: "Notifications, oracles & risk intelligence" },
      { label: "Faucet", href: "/faucet", marker: "◍", description: "Get SOL, mock USDC/USDT and OPEN for testing on devnet" },
    ],
  },
];

export const ACCOUNT_MENU: MenuSection[] = [
  {
    title: "Account",
    items: [
      { label: "Orders", href: "/orders", marker: "⇄", description: "Trade history & active escrow" },
      { label: "My Ads", href: "/ads", marker: "◫", description: "Merchant console & liquidity" },
      {
        label: "Become a merchant",
        href: "/become-a-merchant",
        marker: "◪",
        description: "The bond, a payment account, and where you stand on each",
      },
      { label: "Wallet", href: "/wallet", marker: "◈", description: "Balances & liquidity vaults" },
      { label: "Staking", href: "/staking", marker: "◎", description: "Bond OPEN as a merchant, node, or arbitrator" },
      { label: "Arbitrate", href: "/arbitrate", marker: "⚖", description: "Work a dispute case and cast your ruling" },
      { label: "Earnings", href: "/earnings", marker: "▤", description: "What your node, oracle or gateway has earned" },
      { label: "Settings", href: "/settings", marker: "⚙", description: "Preferences & notifications" },
    ],
  },
  {
    title: "Trust",
    items: [
      { label: "Identity", href: "/account/identity", marker: "✓", description: "Verification levels L0–L3" },
      { label: "Reputation", href: "/account/reputation", marker: "◆", description: "Your tier & dimensions" },
      { label: "Counterparties", href: "/account/counterparties", marker: "⇄", description: "Who you trade with, and how often" },
    ],
  },
];

/**
 * Whether `href` is the route currently being viewed.
 *
 * `/` has to be an exact match: every path starts with it, so a prefix test
 * would mark the exchange active on all 20 routes at once. Everything else is
 * a prefix test so `/orders/abc` still lights up Orders.
 */
export function isActiveRoute(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
