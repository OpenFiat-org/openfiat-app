/**
 * The locales OpenFiat ships in, and the metadata every other i18n file reads.
 *
 * # Which languages, and why these
 *
 * Every language with more than ~50 million **native** speakers, as standard
 * written languages — no dialects. Where a spoken variety has no distinct
 * standardized written form it is folded into the standard it is written in
 * (Egyptian Arabic → Modern Standard Arabic, the Chinese topolects → Standard
 * Chinese in Simplified script), because a UI is read, not spoken, and there is
 * nothing to translate a button into that a reader of the standard would not
 * already read. `zh-Hans` is Standard Chinese, the written standard for the
 * largest language on earth, not a dialect of it.
 *
 * # Why a hand-kept list rather than "everything the CLDR knows"
 *
 * Three things downstream depend on this set being explicit and closed:
 *  - the routing matcher (`i18n/routing.ts`) treats the first URL segment as a
 *    locale *only if it is in this list*, which is what keeps `/usdt/kes` (an
 *    asset pair) from being read as a locale and colliding with the existing
 *    `[asset]/[currency]` routes;
 *  - SEO emits one `hreflang` alternate per entry here, so a stray locale is a
 *    stray URL in every sitemap;
 *  - a message catalogue is expected for each, and the completeness test fails
 *    the build on a locale that has none.
 */

/** A shipped locale and everything the app needs to render in it. */
export interface LocaleMeta {
  /** BCP-47 tag, and the URL prefix for every non-default locale. */
  code: string;
  /** Endonym — the language's name in itself, for the language switcher.
   *  Shown to a speaker of that language, so it is never the English name. */
  nativeName: string;
  /** English name, for `aria-label`s and any English-facing surface. */
  englishName: string;
  /** Writing direction. Drives `<html dir>` and the logical-property layout. */
  dir: "ltr" | "rtl";
}

/**
 * The default locale is served without a URL prefix (`localePrefix:
 * "as-needed"`), so English URLs are unchanged by this whole effort — no
 * redirects, no broken inbound links, no `/en/` appearing anywhere.
 */
export const DEFAULT_LOCALE = "en";

/**
 * Order is deliberate: default first, then by native-speaker reach. The
 * language switcher renders them in this order, and "most speakers first" is a
 * better default than alphabetical for a global audience.
 */
export const LOCALES: LocaleMeta[] = [
  { code: "en", nativeName: "English", englishName: "English", dir: "ltr" },
  { code: "zh-Hans", nativeName: "简体中文", englishName: "Chinese (Simplified)", dir: "ltr" },
  { code: "es", nativeName: "Español", englishName: "Spanish", dir: "ltr" },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi", dir: "ltr" },
  { code: "pt-BR", nativeName: "Português (Brasil)", englishName: "Portuguese (Brazil)", dir: "ltr" },
  { code: "bn", nativeName: "বাংলা", englishName: "Bengali", dir: "ltr" },
  { code: "ru", nativeName: "Русский", englishName: "Russian", dir: "ltr" },
  { code: "ja", nativeName: "日本語", englishName: "Japanese", dir: "ltr" },
  { code: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese", dir: "ltr" },
  { code: "tr", nativeName: "Türkçe", englishName: "Turkish", dir: "ltr" },
  { code: "mr", nativeName: "मराठी", englishName: "Marathi", dir: "ltr" },
  { code: "te", nativeName: "తెలుగు", englishName: "Telugu", dir: "ltr" },
  { code: "ko", nativeName: "한국어", englishName: "Korean", dir: "ltr" },
  { code: "fr", nativeName: "Français", englishName: "French", dir: "ltr" },
  { code: "ta", nativeName: "தமிழ்", englishName: "Tamil", dir: "ltr" },
  { code: "de", nativeName: "Deutsch", englishName: "German", dir: "ltr" },
  { code: "it", nativeName: "Italiano", englishName: "Italian", dir: "ltr" },
  { code: "gu", nativeName: "ગુજરાતી", englishName: "Gujarati", dir: "ltr" },
  { code: "pa", nativeName: "ਪੰਜਾਬੀ", englishName: "Punjabi", dir: "ltr" },
  { code: "th", nativeName: "ไทย", englishName: "Thai", dir: "ltr" },
  { code: "id", nativeName: "Bahasa Indonesia", englishName: "Indonesian", dir: "ltr" },
  { code: "pl", nativeName: "Polski", englishName: "Polish", dir: "ltr" },
  { code: "uk", nativeName: "Українська", englishName: "Ukrainian", dir: "ltr" },
  { code: "kn", nativeName: "ಕನ್ನಡ", englishName: "Kannada", dir: "ltr" },
  { code: "ar", nativeName: "العربية", englishName: "Arabic", dir: "rtl" },
  { code: "ur", nativeName: "اردو", englishName: "Urdu", dir: "rtl" },
  { code: "fa", nativeName: "فارسی", englishName: "Persian", dir: "rtl" },
];

/** Just the codes, in order — the shape `next-intl`'s routing wants. */
export const LOCALE_CODES = LOCALES.map((l) => l.code);

const BY_CODE = new Map(LOCALES.map((l) => [l.code, l]));

/** Metadata for a code, or the default locale's if the code is unknown —
 *  callers reach here only for a value the routing already validated, so an
 *  unknown code is a bug, not user input, and falling back beats throwing in
 *  a render path. */
export function localeMeta(code: string): LocaleMeta {
  return BY_CODE.get(code) ?? BY_CODE.get(DEFAULT_LOCALE)!;
}

/** Writing direction for a locale — the one field the root layout needs on
 *  every request. */
export function localeDir(code: string): "ltr" | "rtl" {
  return localeMeta(code).dir;
}
