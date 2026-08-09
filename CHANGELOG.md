# Changelog

All notable changes to `openfiat-app` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking

- Every client-signed wire event (reservations, settlement, disputes,
  advertisements, reviews, attachments, proposals, votes, the trade
  channel, identity claims, notification subscriptions) is now signed over
  a domain-separated preimage — `len(tag):u32be ‖ utf8(tag) ‖
  json(payload)`, one tag per event type — rather than bare
  `json(payload)` (F-01). `lib/arbitration.ts`'s `signPayload` takes the
  tag as its second argument now; see `lib/domain.ts` and
  `lib/signing-tags.ts`. **Requires a node running F-01's domain-separated
  verification** — an older node rejects every signature this app now
  produces with `INVALID_SIGNATURE`, and this app rejects nothing from an
  older node's own writes since verification is entirely server-side.

### Added

- Initial repository scaffold: directory layout, CI, developer tooling,
  and community health files.

[Unreleased]: https://github.com/OpenFiat-org/openfiat-app/commits/main
