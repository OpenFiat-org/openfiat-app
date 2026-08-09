/**
 * Domain tags for the client-signed wire events this app signs (F-01).
 *
 * Each literal must be byte-identical to its counterpart in
 * `openfiat-core`'s `crates/serialization/src/domain.rs` (the `tag`
 * module) and to the TS SDK's own `tags.ts` — this is a cross-repo
 * contract, not a local convention. `tests/conformance_vectors.test.ts`
 * proves the header these tags feed into matches the Rust side byte for
 * byte, using vectors vendored from that crate.
 *
 * This is deliberately a subset: only the payload types this app actually
 * signs appear here (every call site is `lib/arbitration.ts`'s
 * `signPayload`, grep for its callers to audit this list against the
 * code). Types this app never constructs — sessions, risk, oracles,
 * snapshot, and the two governance/identity tags this app has no builder
 * for — are not reproduced here to avoid a tag going stale from disuse.
 */
export const tags = {
  // advertisements
  AdvertisementCreate: "openfiat/advertisements/AdvertisementCreate/v1",
  AdvertisementStatusSet: "openfiat/advertisements/AdvertisementStatusSet/v1",
  AdvertisementTermsUpdate: "openfiat/advertisements/AdvertisementTermsUpdate/v1",

  // reservations
  ReservationRequest: "openfiat/reservations/ReservationRequest/v1",
  ReservationCancel: "openfiat/reservations/ReservationCancel/v1",

  // settlement
  SettlementInitiate: "openfiat/settlement/SettlementInitiate/v1",
  PaymentSubmitted: "openfiat/settlement/PaymentSubmitted/v1",
  PaymentReversed: "openfiat/settlement/PaymentReversed/v1",
  SettlementApproved: "openfiat/settlement/SettlementApproved/v1",
  SettlementRejected: "openfiat/settlement/SettlementRejected/v1",
  SettlementCancelled: "openfiat/settlement/SettlementCancelled/v1",

  // reviews
  ReviewPublish: "openfiat/reviews/ReviewPublish/v1",

  // disputes
  DisputeOpen: "openfiat/disputes/DisputeOpen/v1",
  ArbitratorJoin: "openfiat/disputes/ArbitratorJoin/v1",
  DisputeVoteCommit: "openfiat/disputes/VoteCommit/v1",
  DisputeVoteReveal: "openfiat/disputes/VoteReveal/v1",

  // governance
  ProposalCreate: "openfiat/governance/ProposalCreate/v1",
  VoteCast: "openfiat/governance/VoteCast/v1",

  // identity — both the avatar claim (`lib/avatar.ts`) and the trade
  // channel's encryption-key enrolment claim (`lib/channel-identity.ts`)
  // are `sendClaimPublish` and share this one tag.
  ClaimPublish: "openfiat/identity/ClaimPublish/v1",

  // content (evidence attachments)
  AttachmentPublish: "openfiat/content/AttachmentPublish/v1",

  // notifications
  SubscriptionUpdate: "openfiat/notifications/SubscriptionUpdate/v1",

  // tradechannel
  TradeChannelKeyGrant: "openfiat/tradechannel/TradeChannelKeyGrant/v1",
  TradeChannelEntryPost: "openfiat/tradechannel/TradeChannelEntryPost/v1",

  // taxonomy — pre-dates F-01's client-signed batch (already tagged on the
  // Rust side as one of the node-internal types), but `sendPaymentMethodDefine`
  // is signed by this app's connected wallet the same way every event above
  // is, so it needs the header here too.
  PaymentMethodDefine: "openfiat/taxonomy/PaymentMethodDefine/v1",
} as const;
