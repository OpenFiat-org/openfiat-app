import type { Vault, VaultEvent, WalletBalance } from "@/lib/types";

/** The current user's OPEN balance (simulated). */
export const OPEN_BALANCE = 12500;

/** OPEN merchant bond required to publish advertisements. */
export const OPEN_BOND_REQUIRED = 5000;

/** Simulated wallet balances (USD-equivalent fiat values are static). */
export const WALLET_BALANCES: WalletBalance[] = [
  { asset: "USDT", balance: 4250.0, fiatValue: 4250.0 },
  { asset: "USDC", balance: 1180.5, fiatValue: 1180.5 },
  { asset: "USD1", balance: 640.0, fiatValue: 640.0 },
  { asset: "SOL", balance: 12.45, fiatValue: 1795.29 },
  { asset: "OPEN", balance: OPEN_BALANCE, fiatValue: 1562.5 },
];

/**
 * Simulated liquidity vaults — per merchant, per stablecoin. Sell ads are
 * backed by pre-deposited vault inventory; reservations move balances from
 * Available to Reserved, and settlement moves them to Settled.
 * Invariant: available + reserved + settled === total.
 */
export const VAULTS: Vault[] = [
  { asset: "USDT", total: 20000, available: 12400, reserved: 5600, settled: 2000 },
  { asset: "USDC", total: 6000, available: 4600, reserved: 400, settled: 1000 },
  { asset: "USD1", total: 1500, available: 1500, reserved: 0, settled: 0 },
  { asset: "SOL", total: 40, available: 28, reserved: 8, settled: 4 },
];

export const VAULT_EVENTS: VaultEvent[] = [
  { time: "13:59", type: "VaultBalanceReserved", asset: "USDT", amount: 800, summary: "800.00 USDT reserved for TRD-7005" },
  { time: "12:46", type: "VaultBalanceReserved", asset: "USDT", amount: 500, summary: "500.00 USDT reserved for TRD-7003" },
  { time: "09:26", type: "VaultBalanceSettled", asset: "USDT", amount: 600, summary: "600.00 USDT settled to LagosNairaPro (TRD-7008)" },
  { time: "08:10", type: "VaultDeposit", asset: "USDT", amount: 5000, summary: "Deposited 5,000.00 USDT from wallet" },
  { time: "07:55", type: "VaultBalanceReleased", asset: "USDC", amount: 400, summary: "400.00 USDC released — TRD-7018 reservation expired" },
  { time: "06:30", type: "VaultWithdrawal", asset: "SOL", amount: 2, summary: "Withdrew 2.00 SOL to wallet" },
];
