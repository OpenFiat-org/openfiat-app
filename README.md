<div align="center">

# openfiat-app

**The default OpenFiat web application — trading, network view, staking, governance, disputes, and transaction history for users and validators.**

[![CI](https://github.com/OpenFiat-org/openfiat-app/actions/workflows/ci.yml/badge.svg)](https://github.com/OpenFiat-org/openfiat-app/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Discussions](https://img.shields.io/github/discussions/OpenFiat-org/openfiat-app)](https://github.com/orgs/OpenFiat-org/discussions)

[Website](https://openfiat.org) · [Docs](https://docs.openfiat.org) · [Specs](https://github.com/OpenFiat-org/openfiat-specs) · [Contributing](CONTRIBUTING.md)

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

For the full protocol motivation and design, see the
[whitepaper](https://github.com/OpenFiat-org/openfiat-specs) and the
[protocol specifications](https://github.com/OpenFiat-org/openfiat-specs/tree/main/Whitepaper/Specifications).

## Deployment

This app is deployed once and served from two custom domains pointing at the
same deployment:

- **app.openfiat.org** — primary
- **openfiat.allenhark.com** — secondary/alias

There is no domain-specific application logic; both domains resolve to the
same build. Configure both as custom domains on whatever hosting platform is
used (e.g., Vercel "Domains" settings) rather than branching in code.

## Repository layout

```
.
├── app/
│   ├── layout.tsx, page.tsx (overview), globals.css
│   ├── trade/                 marketplace: browse ads, open a trade
│   ├── transactions/          transaction history
│   ├── network/               network/node view
│   ├── staking/                stake/unstake, validator selection
│   ├── governance/            proposals and voting
│   ├── disputes/              arbitration case list (validators + parties)
│   ├── identity/              identity claims and reputation
│   └── settings/
├── components/                 Sidebar
├── public/
├── tests/
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
