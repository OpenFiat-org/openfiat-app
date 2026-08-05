"use client";

import { Link } from "@/i18n/navigation";
import { useMemo, useState } from "react";

import { countryViews, flagForCountry, searchCountries } from "@/lib/countries";
import { useReferenceData } from "@/lib/reference";
import { PageHero } from "@/components/page-hero";
import { DataTable, Td, Th, Tr } from "@/components/data-table";

/**
 * Country index, with client-side search over the node's own table.
 *
 * It used to search a 253-row list compiled into this bundle. That list is
 * gone (see `lib/countries.ts`), which changes what this page can be wrong
 * about: it can no longer name a country the network has never heard of, and
 * it can no longer miss one the node added last week.
 *
 * The three answers a node can give are kept apart, because a reader acts
 * differently on each. Asking, could not ask, and answered-with-nothing must
 * not look the same — an empty table under a search box reads as "OpenFiat
 * serves nowhere", which is a claim about the network made out of a failure
 * to reach one.
 */
export function CountryIndex() {
  const [query, setQuery] = useState("");
  const reference = useReferenceData();

  const countries = useMemo(
    () => (reference.status === "ready" ? countryViews(reference.data) : []),
    [reference],
  );
  const described = useMemo(
    () =>
      new Map(
        reference.status === "ready"
          ? reference.data.currencies.map((c) => [c.code, c] as const)
          : [],
      ),
    [reference],
  );
  const results = useMemo(
    () => searchCountries(countries, query, described),
    [countries, query, described],
  );

  return (
    <section>
      <PageHero
        variant="globe"
        title="P2P Exchange by Country"
        description="OpenFiat works everywhere stablecoins reach. Pick a country to see its local order book, currency, and payment methods."
        below={
          <div className="flex max-w-xl items-center gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or currency — e.g. Kenya, KES, euro…"
              aria-label="Search countries"
              className="w-full rounded-md border border-white/10 bg-[#0a0e14]/70 px-4 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-brand/50"
            />
            <span className="shrink-0 text-xs tabular-nums text-gray-500">
              {reference.status !== "ready"
                ? ""
                : query
                  ? `${results.length} match${results.length === 1 ? "" : "es"}`
                  : `${countries.length} countries`}
            </span>
          </div>
        }
      />

      {reference.status === "error" ? (
        <p className="mt-8 text-sm text-amber-300">
          Couldn&apos;t ask your access node which countries and currencies the network supports (
          {reference.message}).{" "}
          <button type="button" onClick={reference.retry} className="underline hover:text-amber-200">
            Try again
          </button>
          <span className="mt-1 block text-xs text-gray-500">
            This is a failure to ask, not a finding that OpenFiat serves nowhere.
          </span>
        </p>
      ) : reference.status === "loading" ? (
        <p className="mt-8 text-sm text-gray-500">Asking your node which countries it serves…</p>
      ) : (
        <div className="mt-8">
          <DataTable
            minWidth={680}
            head={
              <tr>
                <Th>Country / Territory</Th>
                <Th>Currency</Th>
                <Th>Currency name</Th>
                <Th right>Order book</Th>
              </tr>
            }
          >
            {!query && (
              <Tr>
                <Td py="py-5">
                  <Link href="/" className="font-medium text-brand-hover">
                    <span className="mr-2">🌐</span>
                    International
                  </Link>
                </Td>
                <Td className="font-medium text-gray-300">ANY</Td>
                <Td className="text-xs text-gray-500">Any currency, any payment method</Td>
                <Td right>
                  <Link href="/" className="text-sm text-brand hover:text-brand-hover">
                    Trade →
                  </Link>
                </Td>
              </Tr>
            )}
            {results.map((c) => (
              <Tr key={c.code}>
                <Td>
                  <Link
                    href={`/country/${c.slug}`}
                    className="font-medium text-gray-200 hover:text-brand-hover"
                  >
                    <span className="mr-2">{flagForCountry(c.code)}</span>
                    {c.name}
                  </Link>
                </Td>
                <Td className="font-medium text-gray-300">{c.currency}</Td>
                {/* The node's own name for the code, or nothing. A currency
                    it listed against a country but did not describe is shown
                    by its code alone rather than given a name here. */}
                <Td className="text-xs text-gray-500">{described.get(c.currency)?.name ?? "—"}</Td>
                <Td right>
                  <Link
                    href={`/country/${c.slug}`}
                    className="text-sm text-brand hover:text-brand-hover"
                  >
                    Trade →
                  </Link>
                </Td>
              </Tr>
            ))}
            {query && results.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500">
                  No countries match &ldquo;{query}&rdquo;.
                </td>
              </tr>
            )}
          </DataTable>
        </div>
      )}
    </section>
  );
}
