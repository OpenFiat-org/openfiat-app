"use client";

import { useEffect, useState } from "react";
import { Client } from "@openfiat/sdk";

import { NETWORK_LABEL } from "@/lib/node-endpoint";
import { nodeUrlFor, unreachableReason } from "@/lib/node-scheme";
import {
  NODE_CHANGED_EVENT,
  connectableNodes,
  readNodeSelection,
  writeNodeSelection,
  type NodeSelection,
} from "@/lib/node-preference";

/**
 * The footer's live readout: which node this interface is talking to, and a
 * way to change it. It lives in the footer because it is true of every page.
 */
export function NodeChip() {
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
    ? `${selection.label}${selection.chainMode ? ` · ${selection.chainMode}` : ""}`
    : "…";

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

/** Round-trip time to a node's `getHealth`, or `null` if it did not answer. */
async function measure(url: string): Promise<number | null> {
  const started = performance.now();
  try {
    const client = new Client({ endpoint: url, timeoutMs: 4_000 });
    await client.call<Record<string, never>, unknown>("getHealth", {});
    return Math.round(performance.now() - started);
  } catch {
    return null;
  }
}

/**
 * Pick the node this interface talks to.
 *
 * Every entry is a node that actually exists and is actually contacted: the
 * list is `knownNodes()` (the real devnet cluster), and each row's status
 * comes from a live `getHealth` round trip rather than a declared constant.
 * A node that does not answer is shown as unreachable instead of being
 * hidden, because "the node I chose is down" is something the user needs to
 * be able to see.
 */
function AccessNodeModal({
  selection,
  onClose,
}: {
  selection: NodeSelection | null;
  onClose: () => void;
}) {
  const [host, setHost] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [latency, setLatency] = useState<Record<string, number | null>>({});
  const [probing, setProbing] = useState(true);

  const nodes = connectableNodes();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        nodes.map(async (n) => [n.id, await measure(n.url)] as const),
      );
      if (!cancelled) {
        setLatency(Object.fromEntries(entries));
        setProbing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `nodes` is derived from a pure function of build-time config, so it is
    // stable across renders; probing once on open is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectNode(id: string) {
    writeNodeSelection(id);
    setTimeout(onClose, 400);
  }

  /** A custom node gets the same real `getHealth` check as the listed ones. */
  async function connectCustom() {
    const value = host.trim();
    if (!/^[\w.-]+:\d{2,5}$/.test(value)) {
      setError("Enter a host:port address, e.g. p2p.mynode.example:9000");
      return;
    }
    setError("");
    setChecking(true);
    const ms = await measure(nodeUrlFor(value));
    setChecking(false);
    if (ms === null) {
      // Not always the node's fault — see `lib/node-scheme.ts`.
      setError(unreachableReason(value));
      return;
    }
    setError(`✓ reachable — ${ms} ms`);
    selectNode(`custom:${value}`);
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
              The {NETWORK_LABEL} cluster. Each node is contacted directly — status and latency below
              are measured, not declared.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Close">✕</button>
        </div>

        <ul className="max-h-72 divide-y divide-white/5 overflow-y-auto">
          {nodes.map((n) => {
            const ms = latency[n.id];
            const reachable = ms !== null && ms !== undefined;
            return (
              <li key={n.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    probing ? "bg-gray-500" : reachable ? "bg-emerald-400" : "bg-red-400"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-gray-200">{n.label}</p>
                  <p className="text-xs text-gray-500">
                    {n.chainMode} ·{" "}
                    {probing ? "checking…" : reachable ? `${ms} ms` : "unreachable"}
                  </p>
                </div>
                {selection?.id === n.id ? (
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-xs text-emerald-300">
                    Connected
                  </span>
                ) : (
                  <button
                    onClick={() => selectNode(n.id)}
                    className="rounded-md border border-white/15 px-3 py-1 text-xs text-gray-300 hover:bg-white/5"
                  >
                    Use this node
                  </button>
                )}
              </li>
            );
          })}
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
            Sends a real getHealth request to the address above before switching.
          </p>
        </div>
      </div>
    </div>
  );
}
