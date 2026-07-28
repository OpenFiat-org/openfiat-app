<div align="center">

# openfiat-app

**The default OpenFiat web application — trading, network view, staking, governance, disputes, and transaction history for users and validators.**

[![CI](https://github.com/OpenFiat-org/openfiat-app/actions/workflows/ci.yml/badge.svg)](https://github.com/OpenFiat-org/openfiat-app/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Discussions](https://img.shields.io/github/discussions/OpenFiat-org/openfiat-app)](https://github.com/orgs/OpenFiat-org/discussions)

[Website](https://openfiat.network) · [Docs](https://docs.openfiat.network) · [Specs](https://github.com/OpenFiat-org/openfiat-specs) · [Contributing](CONTRIBUTING.md)

</div>

---

## About

`openfiat-app` is part of the [OpenFiat](https://github.com/OpenFiat-org)
ecosystem — an open, decentralized peer-to-peer protocol for exchanging
stablecoins for local fiat currency. Solana secures asset settlement through
audited smart contracts; OpenFiat coordinates the peer-to-peer marketplace
layer (discovery, advertisements, reputation, governance, notifications, and
more) without centralized infrastructure.

This repository (Application) — the default openfiat web application — trading, network view, staking, governance, disputes, and transaction history for users and validators.

This is the actively-developed OpenFiat frontend. It covers the same ground
[`openfiat-apps`](https://github.com/OpenFiat-org/openfiat-apps)'s Node.js
packages were scaffolding (network explorer, merchant dashboard, wallet) —
see `/explorer`, `/merchants/[id]`, and `/wallet` below — with a real design,
navigation, and data model. `openfiat-apps` is no longer under active
development; its Rust `explorer/indexer` still runs for real against
[`openfiat-core`](https://github.com/OpenFiat-org/openfiat-core), but its
frontend packages are kept only for reference.

For the full protocol motivation and design, see the
[whitepaper](https://github.com/OpenFiat-org/openfiat-specs) and the
[protocol specifications](https://github.com/OpenFiat-org/openfiat-specs/tree/main/Whitepaper/Specifications).

## Deployment

This app is deployed once and served from **app.openfiat.network**. There is no
domain-specific application logic; canonical URLs, the sitemap, and robots.txt
all point at that domain.

## Status

The app ships a **fully simulated end-to-end UI** — every screen is navigable
with deterministic demo data (no backend, no wallet signer; all actions are
client-side simulations marked "Simulated data"). It becomes the default
OpenFiat app interface once wired to a live node.

Features:

- **Exchange-terminal design** — dense data tables with hairline dividers,
  tabular figures, and inline metric strips. No card grids, no modals: every
  flow (new order, post advertisement) is a full navigable page. Every
  top-level page opens with a `PageHero` band — an interactive, animated
  canvas in the brand palette (blue → teal) with a unique hand-rolled scene
  per page (flow, globe, ledger, pulse, scales, bloom, ballot, mesh).
- **Top-menu navigation** (P2P Exchange is the landing page): main links for
  P2P Exchange, Countries, Explorer, Disputes, Staking, Governance, Network;
  Orders, My Ads, Wallet, Settings, Identity, and Reputation live under a "My
  Account" mega menu. Real Solana wallet connection (Phantom, Solflare,
  Backpack, Coinbase Wallet, Ledger — injected provider when present,
  simulated otherwise, persisted) with a reputation chip in the nav.
- **Footer** with an access-node chip: pick any Online node or enter a custom
  `host:port` (persisted; defaults to the lowest-latency node), mirrored by
  "Use" actions on the Network page.
- **Merchant profiles** (`/merchants/[id]`, statically generated): tier-ringed
  identity, wallet with copy button, country, availability, stake & ad
  capacity, identity level, full trade stats, 8-dimension reputation bars,
  payment methods, and the merchant's active ads. Every merchant name in the
  app links here.
- **Explorer** (`/explorer`, `/explorer/address/[address]`): search
  (address / trade id / merchant), network metrics, latest protocol events and
  settlements, per-address pages for merchants and your own wallet.
- **Reputation-first merchants**: every merchant shows a tier-colored avatar
  ring (Explorer → Institutional, defined once in `lib/tiers.ts`), tier badge,
  country flag, and orders/completion stats.
- **P2P Exchange** (`/`): buy/sell toggle, asset tabs (USDT, USDC, USD1, SOL),
  searchable country/currency picker with flag emojis, payment/sort filters,
  and a uniform advertiser table. The default view is **International** —
  borderless OTC desks that accept any currency and any payment method
  (USD-priced, FX-converted into every market view). Your last picked or
  browsed country is remembered in `localStorage` and restored on the landing
  page (server render stays deterministic International).
- **Global coverage** (`/p2p`, `/p2p/[country]`): a registry of ~250 countries
  and territories (including partially-recognized states — never hidden) with
  flag, currency, and slug; a statically-prerendered SEO page per country
  pre-filtered to its currency, plus `sitemap.xml` and `robots.txt`.
- **Simulated global liquidity**: ~55 merchants across 40+ cities and a
  deterministically generated ad book (fixed-seed PRNG, static FX table,
  market-appropriate payment methods) across ~45 currencies.
- **Orders** (`/orders`, `/orders/new`, `/orders/[id]`): trade list with state
  filters, a full-page reservation flow, and a trade room with the full
  settlement lifecycle (escrow locked → completed), session log, and simulated
  "I Paid" / dispute actions.
- **OPEN token** (`/open`): official presale hub — live phase indicator, price,
  allocation progress, a simulated purchase widget (USDC/USDT → OPEN), sale
  phase table, and utility links. OPEN also appears as an exchange asset tab
  (presale panel until mainnet), as a balance chip in the nav when connected,
  and as a "Buy OPEN" action on the wallet page.
- **Post Advertisement wizard** (`/ads/new`): Binance-style 5-step flow
  (Market → Pricing → Limits → Payment methods → Review) with per-step
  validation, vault liquidity checks, OPEN-bond gating, localStorage draft
  persistence ("Resume draft"), and a payment-method picker with type-ahead
  suggestions plus community-added custom methods.
- **Wallet** (`/wallet`, `/wallet/deposit`, `/wallet/withdraw`): prominent
  liquidity vaults (Total / Available / Reserved / Settled with utilization
  bars), balances with per-row actions, and full-page deposit/withdraw flows.
- **Disputes** (`/disputes`, `/disputes/[id]`): frozen-escrow cases, evidence
  timelines, arbitrator rulings.
- **Identity & reputation** (`/account/identity`, `/account/reputation`):
  L0–L3 identity claims, and a reputation home with per-dimension guidance and
  the tier ladder (old `/identity` redirects permanently).
- **Staking** (`/staking`, `/staking/stake`): role-based OPEN bonding under My
  Account — merchant bond (ad capacity), node operator positions, arbitrator
  bond (per OFP-019), and service-provider registration stake, with a
  full-page role-aware stake form.
- **Governance** (`/governance`, `/governance/[id]`): treasury, OFP proposals,
  OPEN-weighted vote breakdowns.
- **Network** (`/network`): node inventory by role, "Use node" actions, and a
  protocol event stream.
- **Service Providers** (`/providers`, `/providers/[id]`): the OFS-1500
  Service Registry — notification, oracle, risk-intelligence, snapshot,
  gateway, and API providers with endpoints, capabilities, pricing, and
  registration signatures (settings notes which provider delivers each
  notification channel).
- **Trade room**: full settlement lifecycle with the familiar P2P order flow —
  "Place Order" → pay within the countdown → "Transferred, notify seller" →
  "Pending seller's confirmation" → "Order completed" (seller side: verify
  funds, "Payment received — Release crypto"), Cancel Order before paying and
  Appeal after; working trade chat (simulated acks); an On-chain panel with
  escrow-creation and settlement transaction signatures (Solana-style 88-char
  base58, truncated `5KtP4z…9xYq2m`, full sig copyable) — sigs also surface in
  the Explorer settlements table, order headers, and dispute records; and
  standardized per-method payment details — every field (M-Pesa phone, bank
  account, SWIFT/BIC…) individually copyable.
- **Typography**: Inter (UI sans, `next/font`) with JetBrains Mono for prices,
  amounts, addresses, ids, and signatures across all tabular data.
- **Guide** (`/guide`): beginner step-by-step walkthrough of buying and
  selling on OpenFiat P2P — P2P basics, key terms, 7-step buy and sell flows,
  and safety tips.

## Repository layout

```
.
├── app/
│   ├── layout.tsx, page.tsx (P2P exchange — landing), globals.css
│   ├── p2p/                   country index + per-country SEO pages ([country])
│   ├── merchants/             merchant profiles ([id], statically generated)
│   ├── explorer/              search + events + address pages (address/[address])
│   ├── account/               identity + reputation home
│   ├── orders/                my trades, new order (new/), trade room ([id])
│   ├── ads/                   merchant console + post advertisement (new/)
│   ├── wallet/                vaults + balances + deposit/ + withdraw/
│   ├── disputes/              dispute list + case detail ([id])
│   ├── staking/               OPEN staking, merchant bond
│   ├── governance/            proposals + voting ([id])
│   ├── network/               nodes + protocol event stream
│   ├── settings/              preferences + notification channels
│   ├── sitemap.ts             all static routes + all country pages
│   └── robots.ts
├── components/                top-nav, panel, data-table, metrics, p2p/, orders/, ads/, governance/, settings/
├── lib/
│   ├── types.ts               protocol entity types
│   ├── format.ts              deterministic number/date helpers
│   └── data/                  simulated demo data (countries, merchants, ads, trades, …)
├── public/
├── tests/                     mock-data + countries registry integrity tests
└── docs/
```


## Quick start

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.


## Development

```bash
pnpm lint
pnpm typecheck
pnpm build
```


## Testing

```bash
pnpm test
```


## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and
our [Code of Conduct](CODE_OF_CONDUCT.md) before opening a pull request.
Security issues should be reported per [SECURITY.md](SECURITY.md), not as
public issues.

See [ROADMAP.md](ROADMAP.md) for current priorities and
[CHANGELOG.md](CHANGELOG.md) for release history.

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
