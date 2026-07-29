# Getting started — openfiat-app

## Install and run

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. No environment variables are required — the app
has no `process.env` reads anywhere in `app/`, `lib/`, or `components/`.

## What you'll see without any setup

Most of the app (the P2P exchange book, orders/trade room, wallet,
disputes, the advertisement wizard, merchant profiles) renders from
deterministic demo data in `lib/data/` — nothing to configure, nothing to
connect.

## Seeing live data

Two different "live" surfaces exist, and they connect to different things:

- **Staking and governance** (`/staking`, `/governance`) talk directly to
  Solana devnet (`lib/onchain-config.ts`, hardcoded to
  `https://api.devnet.solana.com`) — no OpenFiat node required. Connect any
  Solana wallet with devnet SOL and, for staking, a real OPEN balance to try
  a live transaction.
- **Explorer and Service Providers** (`/explorer`, `/providers`) call a real
  OpenFiat node's JSON-RPC/WebSocket surface (`lib/live-explorer.ts`,
  `lib/live-providers.ts`), at whatever endpoint the footer's access-node
  picker resolves to. By default that picker's node list
  (`lib/data/network.ts`) is simulated, so pick "Custom" and enter a real
  node's `host:port` — for example a local
  [`openfiat-core`](https://github.com/OpenFiat-org/openfiat-core)
  docker-compose cluster on `localhost:8080` — to see genuine data.

## Verifying a change

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:e2e
```
