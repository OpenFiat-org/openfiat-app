import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-aware replacements for `next/link` and the `next/navigation` hooks.
 *
 * Every internal link in the app must come from here rather than from
 * `next/link`. The reason is the whole point of the effort: a plain
 * `<Link href="/countries">` clicked on `/es/merchants` navigates to
 * `/countries` — the *default*-locale page — silently dropping the reader back
 * into English. These wrappers carry the active locale onto the href, so the
 * same `href="/countries"` resolves to `/es/countries` for a Spanish reader and
 * to `/countries` for an English one, with no per-call locale plumbing.
 *
 * `href`s stay written in their canonical, unprefixed form (`/countries`,
 * `/[asset]/[currency]`); the prefix is applied here, so call sites do not
 * change shape and cannot forget it.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
