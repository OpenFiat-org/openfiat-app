"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Client } from "@openfiat/sdk";

import {
  NODE_CHANGED_EVENT,
  connectableNodes,
  readNodeSelection,
  writeNodeSelection,
  type NodeSelection,
} from "@/lib/node-preference";

const FOOTER_LINKS: Array<[string, string]> = [
  ["Countries", "/countries"],
  ["Guide", "/guide"],
  ["How to buy", "/guide/buy"],
  ["How to sell", "/guide/sell"],
  ["Become a merchant", "/guide/merchant"],
  ["Explorer", "/explorer"],
  ["Network", "/network"],
  ["Providers", "/providers"],
  ["Governance", "/governance"],
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-4 py-8">
        <div className="text-xs text-gray-500">
          <p>© 2026 OpenFiat — decentralized P2P stablecoin protocol. Simulated data, not connected to a live node.</p>
          <nav className="mt-2 flex gap-5">
            {FOOTER_LINKS.map(([label, href]) => (
              <Link key={href} href={href} className="hover:text-gray-300">
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <NodeChip />
      </div>
    </footer>
  );
}

function NodeChip() {
  const [selection, setSelection] = useState<NodeSelection | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const update = () => setSelection(readNodeSelection());
    update();
    window.addEventListener(NODE_CHANGED_EVENT, update);
    return () => window.removeEventListener(NODE_CHANGED_EVENT, update);
  }, []);

  // SSR/initial render shows a neutral placeholder; preference applies post-mount.
  const label = selection
    ? `${selection.id} · ${selection.region}${selection.latencyMs !== null ? ` · ${selection.latencyMs} ms` : ""}`
    : "Resolving closest node…";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-gray-300 hover:border-white/25"
        title="Access node — click to change"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        <span className="tabular-nums">{label}</span>
      </button>
      {open && <AccessNodeModal selection={selection} onClose={() => setOpen(false)} />}
    </>
  );
}

/** User-requested modal: pick or configure the app's access node (simulated). */
function AccessNodeModal({
  selection,
  onClose,
}: {
  selection: NodeSelection | null;
  onClose: () => void;
}) {
  const [host, setHost] = useState("");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  /* Only roles a client can attach to. Offering an oracle or a notification
     gateway here let someone point their interface at a service that has no
     API for it. */
  const online = connectableNodes();

  function useNode(id: string) {
    writeNodeSelection(id);
    setConnected(id);
    setTimeout(onClose, 600);
  }

  /**
   * A custom node is the one case in this footer that's a real host the
   * user actually runs — so, unlike the picker list above (`NETWORK_NODES`,
   * simulated), this is a genuine `getVersion` call via `@openfiat/sdk`
   * before accepting the address, not just a format check.
   */
  async function connectCustom() {
    const value = host.trim();
    if (!/^[\w.-]+:\d{2,5}$/.test(value)) {
      setError("Enter a host:port address, e.g. p2p.mynode.example:9000");
      return;
    }
    setError("");
    setChecking(true);
    try {
      const client = new Client({ endpoint: `http://${value}`, timeoutMs: 5_000 });
      const version = await client.call<Record<string, never>, { version: string }>(
        "getVersion",
        {},
      );
      setError(`✓ reachable — openfiat-node ${version.version}`);
      useNode(`custom:${value}`);
    } catch {
      setError(`Could not reach an OpenFiat node at ${value}`);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-md border border-white/15 bg-[#10151d] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Access node</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Connected: {selection?.id ?? "…"} — the node list below is simulated; a custom node is checked live.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Close">✕</button>
        </div>

        <ul className="max-h-72 divide-y divide-white/5 overflow-y-auto">
          {online.map((n) => (
            <li key={n.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-gray-200">{n.id}</p>
                <p className="text-xs text-gray-500">
                  {n.role} · {n.region} · {n.latencyMs} ms
                </p>
              </div>
              {selection?.id === n.id ? (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-xs text-emerald-300">
                  Connected
                </span>
              ) : (
                <button
                  onClick={() => useNode(n.id)}
                  className="rounded-md border border-white/15 px-3 py-1 text-xs text-gray-300 hover:bg-white/5"
                >
                  {connected === n.id ? "✓" : "Use this node"}
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="border-t border-white/10 px-5 py-4">
          <p className="text-xs font-medium text-gray-300">Custom node</p>
          <div className="mt-2 flex gap-2">
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="p2p.mynode.example:9000"
              className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-gray-600 focus:border-brand/50"
            />
            <button
              onClick={connectCustom}
              disabled={checking}
              className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {checking ? "Checking…" : "Connect"}
            </button>
          </div>
          {error && <p className="mt-1.5 text-xs text-amber-300">{error}</p>}
          <p className="mt-2 text-[11px] text-gray-600">
            Sends a real getVersion request to the address above over HTTP.
          </p>
        </div>
      </div>
    </div>
  );
}
