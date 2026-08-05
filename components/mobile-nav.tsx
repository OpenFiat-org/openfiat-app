"use client";

import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ACCOUNT_MENU,
  ECOSYSTEM_MENU,
  MAIN_LINKS,
  isActiveRoute,
  type MenuSection,
} from "@/components/nav-items";
import { LanguageSwitcher } from "@/components/language-switcher";

/**
 * The navigation below `lg`, as a sheet.
 *
 * # Why this exists
 *
 * The top bar was a single `flex-nowrap` row at every width. Measured on a
 * 390px viewport, `document.documentElement.scrollWidth` was 1046px and the
 * wallet control's right edge was at 1046 — entirely off-screen, on every
 * route, on every phone. `body { overflow-x: clip }` meant no scrollbar ever
 * appeared to say so, so the page looked correct and the single control the
 * whole app depends on could not be reached. See `tests/e2e/nav-layout.spec.ts`,
 * which asserts the geometry rather than the CSS for exactly that reason.
 *
 * # The wallet control is not in here, deliberately
 *
 * The usual mobile pattern sweeps everything including the primary action
 * into the menu. That is the wrong trade for this app: with no wallet
 * connected there is nothing to do on any screen — no vault, no
 * advertisement, no stake, no ruling. So the bar keeps the wallet button at
 * every width and it is the *navigation* that collapses. The menu is the
 * thing you can afford one extra tap to reach; connecting is not.
 *
 * # Not a slide-in drawer
 *
 * A drawer arrives by translating in from off-canvas, which is a horizontal
 * overflow held back by a transform — the same class of thing as the bug
 * above. This drops straight down from the bar it belongs to and never
 * occupies any space outside the viewport's width.
 */

const SHEET_ID = "mobile-nav-sheet";

/** Must match the `lg:` breakpoint the bar switches on. */
const DESKTOP_MIN_WIDTH = 1024;

/**
 * Desktop's two dropdowns, flattened into three labelled groups.
 *
 * The Ecosystem menu carries no section title of its own — on desktop its
 * trigger button is the title, and repeating it inside the panel would be
 * saying the same word twice. A sheet has no trigger sitting above the
 * group, so the heading has to be supplied here.
 */
const GROUPS: MenuSection[] = [
  { titleKey: "ecosystem", items: ECOSYSTEM_MENU.flatMap((s) => s.items) },
  ...ACCOUNT_MENU,
];

export function MobileNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(0);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  // A tap that navigates should leave the menu behind it.
  useEffect(() => setOpen(false), [pathname]);

  /*
   * The sheet hangs off the bottom of the header, which is `sticky top-0`
   * and includes the network banner — so its height is not a constant this
   * file can hardcode without going stale the next time the banner's copy
   * wraps to a second line. It is measured instead.
   *
   * The sheet is portalled to `document.body` rather than rendered inside
   * the header, because the header carries `backdrop-blur`: a
   * `backdrop-filter` makes an element the containing block for its
   * `position: fixed` descendants, so a sheet nested inside it would be
   * positioned against the 64px-tall bar rather than the viewport.
   */
  const measure = useCallback(() => {
    if (window.innerWidth >= DESKTOP_MIN_WIDTH) {
      // Resized up to a width where the bar shows the full row. The sheet is
      // `lg:hidden` so it has already disappeared; without this the scroll
      // lock below would stay applied to a page with no visible menu.
      setOpen(false);
      return;
    }
    const header = document.querySelector("header");
    setTop(header ? Math.max(0, header.getBoundingClientRect().bottom) : 0);
  }, []);

  useEffect(() => {
    if (!open) return;
    measure();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Escape should put the caret back where it came from, not at the top
      // of the document.
      triggerRef.current?.focus();
    };

    // The page behind must not scroll under the sheet. Restores whatever was
    // there before rather than assuming the empty string, so this composes
    // with anything else that touches it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.addEventListener("resize", measure);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", measure);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, measure]);

  const sheet = (
    <div
      id={SHEET_ID}
      style={{ top }}
      className="fixed inset-x-0 bottom-0 z-50 overflow-y-auto overscroll-contain border-t border-white/10 bg-[#0a0e14] motion-safe:animate-[nav-sheet_160ms_ease-out] lg:hidden"
    >
      <nav aria-label="Main" className="px-4 pt-3 pb-12">
        <ul>
          {MAIN_LINKS.map(({ key, href }) => {
            const active = isActiveRoute(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex border-l-2 py-3 pl-4 text-[15px] transition-colors ${
                    active
                      ? "border-brand bg-brand/5 font-medium text-brand-hover"
                      : "border-transparent text-gray-300 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  {t(key)}
                </Link>
              </li>
            );
          })}
        </ul>

        {GROUPS.map((section, i) => (
          <div key={section.titleKey ?? i} className="mt-5 border-t border-white/5 pt-4">
            <p className="pb-1 pl-4 text-[11px] font-semibold tracking-[0.14em] text-gray-500 uppercase">
              {section.titleKey ? t(section.titleKey) : ""}
            </p>
            <ul>
              {section.items.map((item) => {
                const active = isActiveRoute(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-start gap-3 border-l-2 py-2.5 pr-2 pl-3 transition-colors ${
                        active ? "border-brand bg-brand/5" : "border-transparent hover:bg-white/[0.04]"
                      }`}
                    >
                      <span className="text-brand-hover mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/5 text-sm">
                        {item.marker}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={`block text-sm font-medium ${active ? "text-brand-hover" : "text-white"}`}
                        >
                          {t(item.key)}
                        </span>
                        <span className="block text-xs text-gray-500">{t(`${item.key}Desc`)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* Below `lg` the desktop bar's switcher is hidden, so the sheet is
            where a phone reader changes language. */}
        <div className="mt-6 border-t border-white/5 pt-4">
          <LanguageSwitcher />
        </div>
      </nav>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={SHEET_ID}
        aria-label={open ? "Close menu" : "Open menu"}
        className="focus-visible:outline-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-gray-300 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 lg:hidden"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden
        >
          {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
        </svg>
      </button>
      {mounted && open && createPortal(sheet, document.body)}
    </>
  );
}
