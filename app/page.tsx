import type { Metadata } from "next";
import { P2PExchange } from "@/components/p2p/exchange";

export const metadata: Metadata = {
  title: "P2P Exchange",
  description:
    "Buy and sell USDT, USDC, USD1, and SOL peer-to-peer in any currency — international merchants accept any payment method, with escrow enforced by Solana programs.",
};

export default function P2PPage() {
  // Server render is always the deterministic International view; the
  // remembered country preference (localStorage) is applied post-mount.
  return <P2PExchange rememberPreference />;
}
