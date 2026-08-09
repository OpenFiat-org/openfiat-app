# F-01 test safety-net: per-caller tag assertions + tags-literal guard

## Sites that got a `tagOfSignedMessage` (or equivalent) tag assertion

### `tests/trade-flow.test.ts` (real `signMessage` capture via `recorder()`)
`recorder()` now also records the raw signed bytes (`signedRaw`) alongside
the already-parsed body (`signed`), so every existing body/field-order
assertion is untouched and each case can additionally read the tag back out
with `tagOfSignedMessage`.

- `submitReservation` → asserted `tags.ReservationRequest`
- `initiateSettlement` → asserted `tags.SettlementInitiate`
- `submitPayment` → asserted `tags.PaymentSubmitted`
- `approveSettlement` → asserted `tags.SettlementApproved`
- `openDispute` → asserted `tags.DisputeOpen`
- New test **"tags each of a settlement's near-identical exits under its own
  event, not a neighbour's"** exercises the four callers `trade-flow.test.ts`
  didn't previously cover at all (`rejectSettlement`, `reversePayment`,
  `cancelSettlement`, `cancelReservation` — those had only field-order
  coverage in `tests/signed-key-order.test.ts`, which mocks `signPayload`
  itself and so never produces a real domain-tagged message to read a tag
  back out of). This test calls all six of `submitPayment`,
  `approveSettlement`, `rejectSettlement`, `reversePayment`,
  `cancelSettlement`, `cancelReservation` through the same real-signing
  `recorder()`, asserts each against its expected tag, and additionally
  asserts all six tags are pairwise distinct — the highest-collision-risk
  cluster named in the task (near-identical `{ settlement_id, <party>,
  timestamp }` bodies).

### `tests/payment-catalog.test.ts`
`capture()` now also records raw bytes (`signedRaw`). The existing "signs
the definition in the node's own field order" test (`defineMerchantMethod`)
now additionally asserts `tagOfSignedMessage(signedRaw[0]) ===
tags.PaymentMethodDefine`.

### `tests/channel-identity.test.ts`
This file mocks `@/lib/arbitration`'s `signPayload` wholesale (`vi.mock`
replaces it with a bare `vi.fn()`), so there is no domain-header preimage
for `tagOfSignedMessage` to read — the mock stands in for `lib/domain.ts`
entirely, by design, for the rest of the file's tests (which are about key
derivation, not wire format). Rather than rebuilding that fixture to route
through a real `signMessage`, added a new test that asserts the *tag
argument* `enrol` passed into the mocked `signPayload` equals
`tags.ClaimPublish` (`expect(signPayload).toHaveBeenCalledWith(anything(),
tags.ClaimPublish, anything())`). Same protection (catches a tag swap or
typo at this call site), reusing the file's existing mock rather than
introducing a second, heavier fixture alongside it.

## Callers with no existing test — skipped, not fixtured

- **`lib/avatar.ts`'s `publishAvatar`** (ClaimPublish) — no test file
  exercises its signing path at all (`tests/placeholder-avatar.test.ts` only
  covers the generated-image logic, unrelated to `publishAvatar`).
- **`lib/merchant-name.ts`'s publish call** (ClaimPublish) — same; the only
  test touching this file (`tests/live-identity.test.ts`) covers claim
  *reading* (`currentClaimOfType`), not publishing/signing.
- **`components/arbitrate/arbitration-console.tsx`'s vote-commit/reveal**
  (`tags.DisputeVoteCommit` / `tags.DisputeVoteReveal`) — these two tags
  have no builder in `lib/`; the only call sites are directly inside this
  component, which has no test file at all.

Per the task's instruction, none of these got a fixture built from scratch;
authoring one is out of scope here (would be new test infrastructure, not a
tag assertion added alongside an existing one), and the highest-risk cluster
(trade-flow's six near-identical settlement/reservation exits) is fully
covered.

## `tests/signing-tags.test.ts` (new file)

Guards `lib/signing-tags.ts`'s literals themselves, independent of any
caller:

1. Every value in the `tags` object matches
   `/^openfiat\/[a-z]+\/[A-Za-z]+\/v\d+$/` (well-formed
   `openfiat/<domain>/<Type>/v1`).
2. Every tag **except** `PaymentMethodDefine` must have a matching row in
   `tests/vectors/client_signed_v1.json`, and that row's `tag` string must
   equal the literal exactly (`Map` lookup keyed by the literal itself, so a
   near-miss typo — not just "some vector has this general shape" — fails).
3. `PaymentMethodDefine` is handled as the documented exception: asserted
   present, well-formed, and explicitly asserted to have *no* vector row
   (so if a vector row for it is ever added, this test doesn't silently miss
   verifying it — it'll still pass, but the "no vector row" assertion
   documents the exception's boundary). A comment in the test (mirroring
   `lib/signing-tags.ts`'s own comment on that entry) notes its literal is
   verified by hand against the Rust `tag::PAYMENT_METHOD_DEFINE` constant.

## Findings

No tag-mapping bugs found. All existing 707 tests plus the new assertions
pass; no expected-tag value was changed to make a test pass.

## Test results

```
pnpm test
Test Files  61 passed | 5 skipped (66)
     Tests  758 passed | 9 skipped (767)
```

`pnpm typecheck` clean. `pnpm eslint` on the four touched/added test files
clean.

## Files touched

- `tests/trade-flow.test.ts` (extended `recorder()`, added tag assertions,
  added one new test covering 4 previously-untested callers)
- `tests/payment-catalog.test.ts` (extended `capture()`, added tag
  assertion)
- `tests/channel-identity.test.ts` (added tag assertion via mock call args)
- `tests/signing-tags.test.ts` (new file)

No changes to any `lib/` file.
