"use client";

import Link from "next/link";
import { useState } from "react";
import { STAKING_ROLES, STAKING_SUMMARY } from "@/lib/data/staking";
import { PROVIDER_TYPES } from "@/lib/data/providers";
import { formatNumber } from "@/lib/format";
import { Panel } from "@/components/panel";

const inputCls =
  "w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-brand/50 [&>option]:bg-[#10151d]";
const labelCls = "mb-1 block text-xs text-gray-500";

/** Full-page role-based staking form (simulated — no transaction is signed). */
export function StakeForm({ initialRole }: { initialRole?: string }) {
  const [roleKey, setRoleKey] = useState(
    STAKING_ROLES.some((r) => r.role === initialRole) ? (initialRole as string) : "merchant",
  );
  const [amount, setAmount] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [serviceType, setServiceType] = useState("Notification Provider");
  const [done, setDone] = useState(false);

  const role = STAKING_ROLES.find((r) => r.role === roleKey)!;
  const value = Number(amount) || 0;
  const valid =
    value >= role.minBond &&
    (role.role !== "node" || nodeId.trim().length >= 4);

  if (done) {
    return (
      <Panel>
        <div className="px-4 py-14 text-center">
          <p className="text-2xl text-emerald-400">✓</p>
          <h2 className="mt-3 text-lg font-semibold text-white">Stake bonded (simulated)</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
            {formatNumber(value, 0)} OPEN bonded as {role.title}
            {role.role === "node" ? ` for ${nodeId}` : ""}
            {role.role === "provider" ? ` (${serviceType})` : ""}. Rewards accrue from the next epoch; unstaking starts
            a {STAKING_SUMMARY.cooldownDays}-day cooldown.
          </p>
          <Link
            href="/staking"
            className="mt-6 inline-block rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            Back to Staking
          </Link>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Bond OPEN">
      <div className="divide-y divide-white/5">
        <div className="px-4 py-6">
          <p className={labelCls}>Role</p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {STAKING_ROLES.map((r) => (
              <button
                key={r.role}
                onClick={() => setRoleKey(r.role)}
                className={`rounded-md border px-3.5 py-2.5 text-left text-sm transition-colors ${
                  roleKey === r.role ? "border-brand/50 bg-brand/10 text-white" : "border-white/10 text-gray-400 hover:text-white"
                }`}
              >
                <span className="block font-medium">{r.title}</span>
                <span className="mt-0.5 block text-xs text-gray-500">min {formatNumber(r.minBond, 0)} OPEN</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">{role.requirement}</p>
        </div>

        {role.role === "node" && (
          <div className="px-4 py-6">
            <label htmlFor="node-id" className={labelCls}>Node ID you operate</label>
            <input
              id="node-id"
              value={nodeId}
              onChange={(e) => setNodeId(e.target.value)}
              placeholder="e.g. node-ke-full-02"
              className={`font-mono ${inputCls}`}
            />
          </div>
        )}

        {role.role === "provider" && (
          <div className="px-4 py-6">
            <label htmlFor="service-type" className={labelCls}>Service type (OFS-1500)</label>
            <select id="service-type" value={serviceType} onChange={(e) => setServiceType(e.target.value)} className={inputCls}>
              {Object.keys(PROVIDER_TYPES).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}

        <div className="px-4 py-6">
          <div className="flex items-center justify-between">
            <label htmlFor="amount" className={labelCls}>Amount (OPEN)</label>
            <span className="text-xs tabular-nums text-gray-500">
              Minimum bond {formatNumber(role.minBond, 0)} OPEN
              <button onClick={() => setAmount(String(role.minBond))} className="ml-2 text-brand hover:text-brand-hover">
                Set min
              </button>
            </span>
          </div>
          <input
            id="amount"
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`tabular-nums ${inputCls}`}
          />
          {value > 0 && value < role.minBond && (
            <p className="mt-1.5 text-xs text-amber-300">
              Below the {formatNumber(role.minBond, 0)} OPEN minimum for {role.title}.
            </p>
          )}
          <p className="mt-3 text-xs text-gray-500">
            Unstaking starts a {STAKING_SUMMARY.cooldownDays}-day cooldown. Merchant bonds stay locked while you have
            active ads, reservations, or unsettled escrow.
          </p>
        </div>

        <div className="px-4 py-6">
          <button
            onClick={() => valid && setDone(true)}
            disabled={!valid}
            className="w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Bond {value > 0 ? `${formatNumber(value, 0)} ` : ""}OPEN as {role.title}
          </button>
          <p className="mt-2 text-center text-[11px] text-gray-600">Simulated action — no transaction is signed.</p>
        </div>
      </div>
    </Panel>
  );
}
