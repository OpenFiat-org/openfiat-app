# F-01 domain separation — openfiat-app report

Branch: `sdd/f01-domain-separation`. Node already migrated; this task ports the app's
sole signing choke point (`lib/arbitration.ts`'s `signPayload`) to the domain-separated
preimage `len(tag):u32be ‖ utf8(tag) ‖ json(payload)` and re-tags every caller.

## New files

- `lib/domain.ts` — `preimage(tag, body)` / `preimageOf(tag, payload)`, byte-identical
  mirror of the TS SDK's `src/domain.ts` and the Rust `crates/serialization/src/domain.rs`.
- `lib/signing-tags.ts` — `tags` const, one entry per payload type this app actually
  signs (23 entries). Literals copied verbatim from the Rust `tag` module.
- `tests/conformance_vectors.test.ts` — 38 cases (1 file-loaded + 37 rows) against the
  vendored `tests/vectors/client_signed_v1.json`; asserts `preimage(tag, encode(payload_json))`
  hex-matches `preimage_hex` for every vector, i.e. every tag the Rust side emits, not just
  the ones this app happens to use.
- `tests/mocks/domain-header.ts` — shared test helper (`tagOfSignedMessage`,
  `bodyOfSignedMessage`, `payloadOfSignedMessage`) to strip the new header in unit tests
  that previously did `JSON.parse(new TextDecoder().decode(message))` directly.

## `signPayload` signature change

`lib/arbitration.ts`: `signPayload(provider, payload)` → `signPayload(provider, tag, payload)`.
Doc comment updated from "raw Ed25519 over the UTF-8 bytes of JSON.stringify(payload)" to the
domain-separated preimage, and the module-level "Identity" paragraph updated to match.

## Caller → tag map (26 call sites, all read and confirmed against their builder + RPC method)

| File:line | Function | RPC method | Tag |
|---|---|---|---|
| `lib/trade-flow.ts:162` | `submitReservation` | `sendReservationRequest` | `ReservationRequest` |
| `lib/trade-flow.ts:212` | `initiateSettlement` | `sendSettlementInitiate` | `SettlementInitiate` |
| `lib/trade-flow.ts:240` | `submitPayment` | `sendPaymentSubmitted` | `PaymentSubmitted` |
| `lib/trade-flow.ts:262` | `approveSettlement` | `sendSettlementApproved` | `SettlementApproved` |
| `lib/trade-flow.ts:291` | `cancelReservation` | `sendReservationCancel` | `ReservationCancel` |
| `lib/trade-flow.ts:318` | `cancelSettlement` | `sendSettlementCancelled` | `SettlementCancelled` |
| `lib/trade-flow.ts:350` | `reversePayment` | `sendPaymentReversed` | `PaymentReversed` |
| `lib/trade-flow.ts:389` | `rejectSettlement` | `sendSettlementRejected` | `SettlementRejected` |
| `lib/trade-flow.ts:413` | `openDispute` | `sendDisputeOpen` | `DisputeOpen` |
| `lib/merchant-ads.ts:84` | `setAdvertisementStatus` | `sendAdvertisementStatusSet` | `AdvertisementStatusSet` |
| `lib/merchant-ads.ts:119` | `updateAdvertisementTerms` | `sendAdvertisementTermsUpdate` | `AdvertisementTermsUpdate` |
| `lib/merchant-ads.ts:172` | `publishAdvertisement` | `sendAdvertisementCreate` | `AdvertisementCreate` |
| `components/arbitrate/arbitration-console.tsx:159` | `offchainJoin` | `sendArbitratorJoin` | `ArbitratorJoin` |
| `components/arbitrate/arbitration-console.tsx:171` | `offchainCommit` | `sendVoteCommit` | `DisputeVoteCommit` (`VoteCommit/v1`) |
| `components/arbitrate/arbitration-console.tsx:186` | `offchainReveal` | `sendVoteReveal` | `DisputeVoteReveal` (`VoteReveal/v1`) |
| `lib/trade-channel.ts:329` | `grantChannelKey` | `sendTradeChannelKeyGrant` | `TradeChannelKeyGrant` |
| `lib/trade-channel.ts:406` | `postChannelEntry` | `sendTradeChannelEntry` | `TradeChannelEntryPost` |
| `lib/proposal-flow.ts:107` | `createProposal` | `sendProposalCreate` | `ProposalCreate` |
| `lib/proposal-flow.ts:132` | `castNodeVote` | `sendVoteCast` | `VoteCast` |
| `lib/review-flow.ts:133` | `publishReview` | `sendReviewPublish` | `ReviewPublish` |
| `lib/attachments.ts:178` | `publishAttachment` | `sendAttachmentPublish` | `AttachmentPublish` |
| `lib/avatar.ts:116` | `publishAvatar` | `sendClaimPublish` | `ClaimPublish` |
| `lib/channel-identity.ts:288` | `enrol` | `sendClaimPublish` | `ClaimPublish` |
| `lib/merchant-name.ts:115` | `publishMerchantName` | `sendClaimPublish` | `ClaimPublish` |
| `lib/notifications.ts:169` | `publishSubscription` | `sendSubscriptionUpdate` | `SubscriptionUpdate` |
| `lib/payment-catalog.ts:185` | `defineMerchantMethod` | `sendPaymentMethodDefine` | `PaymentMethodDefine` |

## Corrections to the task's starting map

- **`lib/avatar.ts` and `lib/channel-identity.ts` are `ClaimPublish`, not `AttachmentPublish`.**
  Both call `sendSignedEvent(nodeUrl(), "sendClaimPublish", ...)` — the avatar is published as
  an identity claim (OFS-5000, value = a CID), not a content attachment. Only `lib/attachments.ts`
  (evidence files on a settlement) is genuinely `AttachmentPublish`.
- `lib/merchant-ads.ts`'s `update` builder is confirmed `AdvertisementTermsUpdate` (fields:
  `id, merchant, min_trade, max_trade, payment_methods, timestamp`, RPC
  `sendAdvertisementTermsUpdate`). The app has no `AdvertisementPriceUpdate` caller at all —
  not included in `lib/signing-tags.ts`.
- `lib/trade-flow.ts` `cancel`/`action` sites disambiguated purely by each function's own RPC
  method name (`sendReservationCancel` vs. the five `sendSettlement*` methods) — no ambiguity
  once read; every function name plus its `sendSignedEvent` call states its type outright.
- No `DeliveryReport` caller exists in the app (matches the SDK, which also omits it) — dropped
  from `lib/signing-tags.ts`.

## Two callers not in the task's starting list, found via a grep encoding gap

`grep -rn "signPayload("` without `-a` silently skipped `lib/merchant-name.ts` and
`lib/payment-catalog.ts` — both contain one raw `\x00` byte each (pre-existing, unrelated to
this change: a control-char regex literal in `merchant-name.ts`, a template-literal cache-key
separator in `payment-catalog.ts`), which makes plain `grep` treat them as binary. A full
`os.walk` + byte-level Python scan turned up both:

- **`lib/merchant-name.ts:115`** `publishMerchantName` → `sendClaimPublish` → `ClaimPublish`.
- **`lib/payment-catalog.ts:185`** `defineMerchantMethod` → `sendPaymentMethodDefine` →
  `PaymentMethodDefine` (`openfiat/taxonomy/PaymentMethodDefine/v1` — one of the tags that
  pre-dates F-01 on the Rust side, but is signed by this app's wallet the same way every
  F-01 event is, so it needed the same header and is now in `lib/signing-tags.ts`).

I re-ran the byte-level scan after fixing both and confirmed all 26 `signPayload(` call sites
across the repo (`.ts`/`.tsx`, excluding `node_modules`) now pass a `tags.*` argument — none
missed.

## Flagged / ambiguous

None left unresolved. Every caller above was confirmed by reading its builder's field list,
its doc comment (most name the exact Rust struct and RPC method already), and the
`sendSignedEvent(..., "sendX", ...)` call it feeds. The only real ambiguities the task
anticipated (avatar/channel-identity's tag, merchant-ads `update`'s tag) are resolved and
noted above.

## Also updated (not `signPayload` callers, but hand-rolled raw-JSON signing that would break
against an F-01 node)

- `tests/settlement-codes.live.test.ts` — its local `signed()` helper built
  `sign(keypair, TextEncoder().encode(JSON.stringify(payload)))` directly (bypassing
  `signPayload`, since it signs with a bare `@openfiat/sdk` keypair rather than a wallet
  provider). Switched to `sign(keypair, preimageOf(tag, payload))` with the correct tag per
  call site (`SettlementCancelled`, `SettlementInitiate`). Skipped by default
  (`OPENFIAT_LIVE_CODES=1` required); fixed so it stays correct if someone runs it.
- `tests/e2e/governance.spec.ts`, `tests/e2e/merchant-ads.spec.ts`, `tests/e2e/taker-order.spec.ts`
  — Playwright fixtures that publish an `AdvertisementCreate`/`ProposalCreate` straight to a
  real node with a hand-signed bare-JSON signature (bypassing the UI, as fixture setup for a
  different flow under test). Switched to `preimageOf(tags.AdvertisementCreate/ProposalCreate, ...)`.
  These need a live node (`OPENFIAT_E2E_NODE_URL`) and are skipped without one, so `pnpm test`
  doesn't exercise them, but they'd have failed outright against a real F-01 node otherwise.
- Left alone (verified they route through `signPayload`'s own mock or a real `SolanaProvider`
  built around the app's `signMessage`, so they picked up the fix automatically): the
  Playwright `__e2eSign` fixtures in `onboarding.spec.ts`, `reviews.spec.ts`,
  `merchant-journey.spec.ts`; the `walletFor()` mocks in `tests/trade-devnet.live.test.ts` and
  `tests/trade-channel.live.test.ts` (both call real `lib/trade-flow.ts` / `lib/trade-channel.ts`
  functions, which now build the correct preimage internally).
- Left alone, confirmed out of scope per the task: `channel-identity.ts`'s
  `signDerivationMessage` (signs `DERIVATION_MESSAGE` directly, no `signPayload`, not a wire
  event), `faucet-client.ts`, `earnings.ts` (`earningsChallengeBytes`), `wallet-proof.ts`
  (`challengeBytes`) — none of these call `signPayload` or construct a client-signed wire event.

## Existing tests updated for the new header (previously asserted bare-JSON bytes)

- `tests/trade-flow.test.ts` — its `recorder()`'s mock `signMessage` now decodes the payload via
  the new `tests/mocks/domain-header.ts#payloadOfSignedMessage` (strips the `len(tag) ‖ tag`
  header before `JSON.parse`) instead of parsing the raw bytes directly.
- `tests/merchant-ads.test.ts`, `tests/payment-catalog.test.ts` — same fix, via
  `bodyOfSignedMessage` (these push the still-stringified body, since the test bodies do their
  own `JSON.parse` downstream).
- `tests/arbitration.test.ts`, `tests/signed-key-order.test.ts`, `tests/channel-identity.test.ts`
  — untouched; all three mock `signPayload`/`sendSignedEvent` wholesale (`vi.fn(async () =>
  "sig")` or similar) and never construct or parse real signed bytes, so they were unaffected
  by the header change.

## CHANGELOG

Added a `### Breaking` section to the existing `CHANGELOG.md` (`[Unreleased]`), describing the
domain-separated signing switch and the new node requirement.

## Test results

- `npx vitest run`: **707 passed, 9 skipped** (0 failed), 60 files passed / 5 skipped
  (the skipped ones are the `*.live.test.ts` files, gated on env vars pointing at a live node).
  Includes the new `tests/conformance_vectors.test.ts` (38/38 passed) proving this app's
  `preimage()` matches every vector `openfiat-core` vendors — not just the tags this app uses.
- `npx tsc --noEmit`: clean, no output.
- `npx eslint .`: clean, no output.
- `npx next build`: succeeded (Turbopack, all locales/routes generated).

## Concerns / notes for reviewers

- The two hidden-by-grep callers (`merchant-name.ts`, `payment-catalog.ts`) are a real lesson:
  a plain `grep -rn` without `-a`/`-I` silently drops any file `grep` heuristically calls
  binary — worth remembering for the next repo-wide audit in this codebase, since it already
  has two files with a stray literal NUL byte in otherwise-ordinary TypeScript.
- `PaymentMethodDefine` sits in a slightly different bucket than the other F-01 tags: the Rust
  `tag` module lists it in the *pre-existing* section (types "constructed and verified entirely
  inside this workspace... never by an SDK or the app"), but `lib/payment-catalog.ts` very much
  does sign and send it from a connected wallet. I tagged it with the existing
  `tag::PAYMENT_METHOD_DEFINE` literal since that's the one live on the Rust side for this
  struct shape — flagging in case the node-side doc comment there needs a one-line correction
  to acknowledge the app also signs this type.
