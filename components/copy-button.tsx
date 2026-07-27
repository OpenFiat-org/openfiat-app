"use client";

import { useState } from "react";

/** Small copy-to-clipboard button with "Copied" feedback. */
export function CopyButton({ value, className = "" }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard unavailable (permissions) — still show feedback */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={copy}
      title={`Copy ${value}`}
      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
        copied
          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
          : "border-white/15 text-gray-500 hover:border-white/30 hover:text-gray-300"
      } ${className}`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
