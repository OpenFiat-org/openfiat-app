"use client";

import { useMemo } from "react";
import type { ReferenceData } from "@openfiat/sdk";

import { flagForCountry } from "@/lib/countries";

/**
 * A country, chosen from the node's list.
 *
 * A native `<select>` rather than the combobox the currency picker uses,
 * deliberately. 253 rows is within what a native control handles well, it
 * comes with type-ahead, keyboard navigation and a platform-native sheet on
 * a phone for free, and — the part that matters here — none of those are
 * things this app has to get right a second time.
 *
 * `countries` is passed in rather than fetched, because every screen using
 * this already holds the node's answer and needs its loading and error
 * states rendered in its own layout. A control that fetched for itself would
 * either duplicate those states or hide them.
 */
export function CountrySelect({
  value,
  onChange,
  countries,
  id,
  className,
  placeholder = "Select a country",
}: {
  /** ISO (or pseudo) country code, or `""` for none chosen. */
  value: string;
  onChange: (code: string) => void;
  countries: ReferenceData["countries"];
  id?: string;
  className?: string;
  placeholder?: string;
}) {
  // Sorted by name here rather than taken in the node's order, which is
  // grouped by region — useful on a map, unhelpful in a dropdown somebody is
  // scanning for one name.
  const sorted = useMemo(
    () => [...countries].sort((a, b) => a.name.localeCompare(b.name)),
    [countries],
  );

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="">{placeholder}</option>
      {sorted.map((country) => (
        <option key={country.code} value={country.code}>
          {flagForCountry(country.code)} {country.name} — {country.currency}
        </option>
      ))}
    </select>
  );
}
