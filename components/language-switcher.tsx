"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALES } from "@/i18n/locales";

/**
 * Language switcher.
 *
 * Without this, the 27 locales are reachable only by hand-editing the URL — the
 * localization is real but undiscoverable. This is the control that surfaces
 * it: a menu of every shipped language, by its own name, that switches locale
 * while staying on the current page.
 *
 * Staying on the page is the part that matters and the part `next-intl` makes
 * possible here. `usePathname` from `@/i18n/navigation` returns the path with
 * the locale prefix already stripped, and `router.replace(pathname, {locale})`
 * re-applies the chosen one — so a reader on `/es/country/germany` who picks
 * German lands on `/de/country/germany`, not back at a localized home. `replace`
 * rather than `push` so the language toggle doesn't pile entries into the back
 * button.
 *
 * Endonyms, not English names: the whole point is that a speaker of a language
 * recognizes it, and "Deutsch" is recognized by a German reader in a way
 * "German" is not.
 */
export function LanguageSwitcher() {
  const t = useTranslations("languageSwitcher");
  const activeLocale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const active = LOCALES.find((l) => l.code === activeLocale) ?? LOCALES[0];

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

  function choose(code: string) {
    setOpen(false);
    if (code !== activeLocale) {
      // `pathname` is already locale-stripped; the option's code re-prefixes it.
      router.replace(pathname, { locale: code });
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t("changeLanguage")}
        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-sm text-gray-300 transition-colors hover:border-white/25 hover:text-white"
      >
        <span aria-hidden="true">🌐</span>
        <span className="max-w-[8rem] truncate">{active.nativeName}</span>
        <span className="text-xs text-gray-600">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={t("label")}
          className="absolute right-0 z-50 mt-1 max-h-[70vh] w-56 overflow-y-auto rounded-md border border-white/15 bg-[#10151d] p-1.5 shadow-xl"
        >
          {LOCALES.map((locale) => {
            const selected = locale.code === activeLocale;
            return (
              <button
                key={locale.code}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => choose(locale.code)}
                dir={locale.dir}
                className={`flex w-full items-center justify-between gap-3 rounded px-2.5 py-2 text-start text-sm transition-colors hover:bg-white/[0.06] ${
                  selected ? "text-brand-hover" : "text-gray-300"
                }`}
              >
                <span className="truncate">{locale.nativeName}</span>
                <span className="shrink-0 text-xs text-gray-600">{locale.englishName}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
