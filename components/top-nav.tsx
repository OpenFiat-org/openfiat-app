"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { WalletConnect } from "@/components/wallet-connect";
import { NetworkBadge } from "@/components/network-badge";

const MAIN_LINKS: Array<[string, string]> = [
  ["P2P Exchange", "/"],
  ["Countries", "/countries"],
  ["Disputes", "/disputes"],
  ["Governance", "/governance"],
];

interface MenuSection {
  title?: string;
  items: Array<{ label: string; href: string; marker: string; description: string }>;
}

const ECOSYSTEM_MENU: MenuSection[] = [
  {
    items: [
      { label: "Explorer", href: "/explorer", marker: "⌕", description: "Search addresses, trades & protocol events" },
      { label: "Network", href: "/network", marker: "⛁", description: "Nodes, peers & event stream" },
      { label: "Providers", href: "/providers", marker: "⚡", description: "Notifications, oracles & risk intelligence" },
      { label: "Faucet", href: "/faucet", marker: "◍", description: "Get mock USDC/USDT for testing on devnet" },
    ],
  },
];

const ACCOUNT_MENU: MenuSection[] = [
  {
    title: "Account",
    items: [
      { label: "Orders", href: "/orders", marker: "⇄", description: "Trade history & active escrow" },
      { label: "My Ads", href: "/ads", marker: "◫", description: "Merchant console & liquidity" },
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

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0e14]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 text-lg font-semibold text-white">
          <Image src="/logo-mark.png" alt="" width={28} height={28} priority />
          OpenFiat
        </Link>

        {/* Single row in both wallet states: fits at desktop widths, tightens on smaller ones. */}
        <nav className="flex flex-1 flex-nowrap items-center gap-x-0.5">
          {MAIN_LINKS.map(([label, href]) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <NavLink key={href} href={href} active={active}>
                {label}
              </NavLink>
            );
          })}
          <NavMenu label="Ecosystem" sections={ECOSYSTEM_MENU} width="w-80" />
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <NetworkBadge />
          <NavMenu label="My Account" sections={ACCOUNT_MENU} width="w-[36rem]" align="right" />
          <WalletConnect />
        </div>
      </div>

      {/*
        * This banner previously said the programs were "audited" and that the
        * app was "not connected to a live node". Neither was true: no external
        * audit has been performed (OFS-4200 keeps that explicitly out of
        * scope), and the app now queries a real devnet node by default. Both
        * errors pointed the same way — toward sounding more finished than the
        * deployment is — which is the direction that costs a reader money.
        */}
      <div className="border-t border-amber-400/10 bg-amber-400/5">
        <p className="mx-auto max-w-7xl px-4 py-1.5 text-center text-xs text-amber-200/80">
          Running on <strong className="font-semibold text-amber-200">devnet</strong> — a test
          network. Tokens and balances here have no value, and the Solana programs are
          unaudited. OpenFiat never takes custody of fiat; escrow is enforced on chain.
        </p>
      </div>
    </header>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`relative flex h-16 items-center whitespace-nowrap px-3 text-sm transition-colors ${
        active ? "font-medium text-brand" : "text-gray-400 hover:text-white"
      }`}
    >
      {children}
      {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}
    </Link>
  );
}

/** Mega-menu dropdown — a nav control, not a data modal. */
function NavMenu({
  label,
  sections,
  width,
  align = "left",
}: {
  label: string;
  sections: MenuSection[];
  width: string;
  align?: "left" | "right";
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const routes = sections.flatMap((s) => s.items.map((i) => i.href));
  const active = routes.some((href) => pathname.startsWith(href));

  // Close on outside pointer-down (trigger + panel both live inside rootRef,
  // whose ancestor's backdrop-blur makes fixed-position backdrops unreliable),
  // on Escape, and on link click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`relative flex h-16 cursor-pointer items-center gap-1.5 whitespace-nowrap px-3 text-sm transition-colors ${
          active ? "font-medium text-brand" : "text-gray-400 hover:text-white"
        }`}
      >
        {label}
        <span className="text-xs text-gray-600">{open ? "▴" : "▾"}</span>
        {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}
      </button>
      {open && (
        <div
          className={`absolute ${align === "right" ? "right-0" : "left-0"} z-50 mt-1 ${width} rounded-md border border-white/15 bg-[#10151d] p-4 shadow-xl`}
        >
          <div className={`grid gap-x-6 ${sections.length > 1 ? "grid-cols-2" : ""}`}>
            {sections.map((section, i) => (
              <div key={section.title ?? i}>
                {section.title && (
                  <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {section.title}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {section.items.map((item) => {
                    const itemActive = pathname.startsWith(item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={`flex items-start gap-3 rounded-md px-2 py-2.5 hover:bg-white/[0.04] ${
                            itemActive ? "bg-brand/5" : ""
                          }`}
                        >
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/5 text-sm text-brand-hover">
                            {item.marker}
                          </span>
                          <span>
                            <span className={`block text-sm font-medium ${itemActive ? "text-brand-hover" : "text-white"}`}>
                              {item.label}
                            </span>
                            <span className="block text-xs text-gray-500">{item.description}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
