import en from "@/messages/en.json";
import type { RefusalTranslator } from "@/lib/node-refusal";

/**
 * A `RefusalTranslator` backed by the English message catalogue, so the
 * refusal tests assert the same copy the app resolves — it just now lives in
 * `messages/en.json` under `refusals.*` rather than in per-domain maps.
 */
const refusals = (en as { refusals: Record<string, unknown> }).refusals;

function lookup(key: string): unknown {
  return key.split(".").reduce<unknown>(
    (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
    refusals,
  );
}

export const R: RefusalTranslator = Object.assign(
  (key: string, values?: Record<string, string | number>): string => {
    const raw = lookup(key);
    if (typeof raw !== "string") return key;
    return raw.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? `{${name}}`));
  },
  {
    has: (key: string): boolean => typeof lookup(key) === "string",
  },
);
