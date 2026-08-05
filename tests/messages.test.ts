import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { LOCALE_CODES, DEFAULT_LOCALE } from "@/i18n/locales";

/**
 * Message-catalogue integrity. Two failure modes this guards against, both of
 * which ship silently otherwise:
 *
 *  - a translated key that does not exist in the English source — a typo or a
 *    stale key that renders as nothing, in a language the author cannot read;
 *  - a *partially* translated namespace, where half of `nav` is the reader's
 *    language and half is English, which looks broken rather than untranslated.
 *
 * It deliberately does NOT require every locale to translate every key: the
 * long-tail locales ship with empty catalogues and fall back to English by
 * design (see i18n/request.ts), and that is a supported state, not a defect.
 */

const messagesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "messages");

type Json = Record<string, unknown>;

function load(code: string): Json {
  return JSON.parse(readFileSync(path.join(messagesDir, `${code}.json`), "utf8")) as Json;
}

/** Namespaced keys (`nav.wallet`), ignoring the `$comment` metadata field. */
function keysOf(obj: Json, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("$")) continue;
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...keysOf(v as Json, full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const en = load(DEFAULT_LOCALE);
const enKeys = new Set(keysOf(en));

describe("message catalogues", () => {
  it("has exactly one JSON file per shipped locale, and no strays", () => {
    const files = readdirSync(messagesDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    expect(files).toEqual([...LOCALE_CODES].sort());
  });

  for (const code of LOCALE_CODES) {
    if (code === DEFAULT_LOCALE) continue;
    const localeKeys = keysOf(load(code));

    it(`${code}: every translated key exists in the English source`, () => {
      const orphans = localeKeys.filter((k) => !enKeys.has(k));
      expect(orphans, `keys not present in en.json: ${orphans.join(", ")}`).toEqual([]);
    });

    it(`${code}: the nav namespace is all-or-nothing, never half-translated`, () => {
      const localeNav = localeKeys.filter((k) => k.startsWith("nav."));
      if (localeNav.length === 0) return; // untranslated locale — fine, falls back
      const enNav = [...enKeys].filter((k) => k.startsWith("nav."));
      expect(new Set(localeNav)).toEqual(new Set(enNav));
    });
  }
});
