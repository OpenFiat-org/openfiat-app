/**
 * The navigation's destinations, shared by the desktop mega-menus in
 * `components/top-nav.tsx` and the mobile sheet in
 * `components/mobile-nav.tsx`.
 *
 * Shared rather than duplicated because the two are meant to be the same
 * site. A phone that offers a subset of the routes a laptop offers is a
 * different product with the same logo, and the way that happens is somebody
 * adds a route to one list and not the other.
 *
 * # Labels live in the message catalogue, not here
 *
 * Each item carries a `key` rather than an English string. The rendering
 * components look the label and description up in the `nav` namespace
 * (`messages/<locale>.json`) via `useTranslations`, so the nav reads in the
 * viewer's language. This file keeps the structure — order, grouping, route,
 * marker — which is the same in every language; only the words change, and the
 * words belong where every other translated word does.
 */

export interface NavItem {
  /** Message key under the `nav` namespace. The label is `t(key)` and the
   *  description is `t(`${key}Desc`)`. */
  key: string;
  href: string;
  /**
   * The glyph shown in the item's square marker. Typographic, not an icon
   * font or an SVG set: it is the one visual device this nav has of its own,
   * and it costs nothing to load. Language-independent, so it stays here.
   */
  marker: string;
}

export interface MenuSection {
  /** Message key for the section heading, under the `nav` namespace. */
  titleKey?: string;
  items: NavItem[];
}

/** Top-level market surfaces. Public, and usable without a wallet. */
export const MAIN_LINKS: Array<{ key: string; href: string }> = [
  { key: "exchange", href: "/" },
  { key: "countries", href: "/countries" },
  { key: "disputes", href: "/disputes" },
  { key: "governance", href: "/governance" },
];

export const ECOSYSTEM_MENU: MenuSection[] = [
  {
    items: [
      { key: "explorer", href: "/explorer", marker: "⌕" },
      { key: "network", href: "/network", marker: "⛁" },
      { key: "providers", href: "/providers", marker: "⚡" },
      { key: "faucet", href: "/faucet", marker: "◍" },
    ],
  },
];

export const ACCOUNT_MENU: MenuSection[] = [
  {
    titleKey: "sectionAccount",
    items: [
      { key: "orders", href: "/orders", marker: "⇄" },
      { key: "ads", href: "/ads", marker: "◫" },
      { key: "becomeMerchant", href: "/become-a-merchant", marker: "◪" },
      { key: "wallet", href: "/wallet", marker: "◈" },
      { key: "staking", href: "/staking", marker: "◎" },
      { key: "arbitrate", href: "/arbitrate", marker: "⚖" },
      { key: "earnings", href: "/earnings", marker: "▤" },
      { key: "settings", href: "/settings", marker: "⚙" },
    ],
  },
  {
    titleKey: "sectionTrust",
    items: [
      { key: "identity", href: "/account/identity", marker: "✓" },
      { key: "reputation", href: "/account/reputation", marker: "◆" },
      { key: "counterparties", href: "/account/counterparties", marker: "⇄" },
    ],
  },
];

/**
 * Whether `href` is the route currently being viewed.
 *
 * `/` has to be an exact match: every path starts with it, so a prefix test
 * would mark the exchange active on all 20 routes at once. Everything else is
 * a prefix test so `/orders/abc` still lights up Orders.
 *
 * `pathname` is expected to be locale-stripped (the `usePathname` from
 * `@/i18n/navigation` returns it that way), so this never needs to know which
 * language the reader is in.
 */
export function isActiveRoute(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
