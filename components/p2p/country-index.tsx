"use client";

import Link from "next/link";
import { useState } from "react";
import { COUNTRIES, searchCountries } from "@/lib/data/countries";
import { PageHero } from "@/components/page-hero";
import { DataTable, Td, Th, Tr } from "@/components/data-table";

/** Country index with client-side search over the registry. */
export function CountryIndex() {
  const [query, setQuery] = useState("");
  const results = searchCountries(query);

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
              className="w-full rounded-md border border-white/10 bg-[#0a0e14]/70 px-4 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-brand/50"
            />
            <span className="shrink-0 text-xs tabular-nums text-gray-500">
              {query ? `${results.length} match${results.length === 1 ? "" : "es"}` : `${COUNTRIES.length} countries`}
            </span>
          </div>
        }
      />

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
                <Link href={`/p2p/${c.slug}`} className="font-medium text-gray-200 hover:text-brand-hover">
                  <span className="mr-2">{c.flag}</span>
                  {c.name}
                </Link>
              </Td>
              <Td className="font-medium text-gray-300">{c.currencyCode}</Td>
              <Td className="text-xs text-gray-500">{c.currencyName}</Td>
              <Td right>
                <Link href={`/p2p/${c.slug}`} className="text-sm text-brand hover:text-brand-hover">
                  Trade →
                </Link>
              </Td>
            </Tr>
          ))}
          {query && results.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500">
                No countries match “{query}”.
              </td>
            </tr>
          )}
        </DataTable>
      </div>
    </section>
  );
}
