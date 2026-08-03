# Which node methods this app calls, and which it deliberately does not

The node answers 99 JSON-RPC methods. This app is not supposed to call all of
them, and "we never got round to it" and "a browser must not ask this" look
identical from the outside — which is how a surface gets rebuilt from scratch
every time somebody diffs `openrpc.json` against the source tree.

So this file records the judgment for the operator- and provider-facing half of
that diff (task #204). One line each. Disagree with any of it in a commit that
says why, rather than quietly adding the call.

The other half — governance, reviews, trade exit paths — is recorded by whoever
took it.

## Node operators

| Method | App-facing | Why |
| --- | --- | --- |
| `getPeers` | Yes — `lib/live-peers.ts` | The one method that answers "how big is this network and who is on it". `/network` carried the sentence "peer count and version are still absent because no method this app calls reports them" for months; this is the method, and each peer's `node_version` and declared roles come with it. |
| `getSnapshots` | Yes — `lib/live-snapshots.ts` | What a node choosing to join can actually download, who produced it, and how far behind it is. An operator picking a node has no other way to see whether it is worth syncing from. |
| `getLatestSnapshot` | Yes — `lib/live-snapshots.ts` | The node's own answer to "which one would you hand a joiner". Deriving it here by taking the max `slot` of `getSnapshots` would be this app deciding a question the node already decides, and the two could disagree. |
| `getSnapshot` | No | It returns a record `getSnapshots` already returned in full. There is no snapshot detail page and no id a browser holds without having just listed it, so the by-id read has no caller that the list does not serve. |
| `sendSnapshotAnnounce` | No | A node announces its own snapshots on a timer. A browser has none to announce, and could not sign one as a node even if it did. |
| `getCheckpointSlot` | Yes — `lib/live-snapshots.ts` | Sits directly beside the snapshots: the slot a joining node replays forward from. Without it a snapshot slot is a number with nothing to be measured against. |
| `getRewardObservations` | Yes — `lib/live-rewards.ts` | What a node operator earned and why, per OFS-4100 §9.4 — published precisely so the schedule can be recomputed and checked by anyone. `/earnings` otherwise only answers for registered *services*, and a node operator is not one. |

## Sessions (OFS-1400)

**None of the six.** Not "not yet built" — not connected to anything.

`crates/sessions/README.md` says it outright under **Used by**: "Nothing yet —
a real RPC signed-request auth flow that establishes a session per connected
client is a natural follow-up once `rpc`'s per-request auth model needs one;
today `rpc` authenticates each mutation by its own embedded signature instead."

A wallet's active-session list is a genuinely good security affordance, and it
is the reason to revisit this. It is not a reason to build it now: nothing in
the system establishes a session, so `getSessionsByWallet` returns `[]` for
every wallet on the network, and a screen reading "no active sessions" would be
telling a user their account is not signed in anywhere when the truth is that
this protocol does not currently sign anyone in anywhere. That is a worse answer
than no screen at all, and it is the exact "empty and unreachable must not look
the same" failure one layer up: here, *empty and not-a-concept* would look the
same.

| Method | App-facing | Why |
| --- | --- | --- |
| `sendSessionEstablish` | No | Nothing consumes a session, so establishing one authorizes nothing. |
| `sendSessionRenew` | No | Nothing to renew. |
| `sendSessionRevoke` | No | The affordance worth having, and worth nothing until sessions exist. |
| `sendSessionMigrate` | No | Node-to-node handoff of a Primary Session Host (§11); not a browser action in any design. |
| `getSession` | No | See above. |
| `getSessionsByWallet` | No | See above — always `[]`, and misleadingly so. |

Revisit all six together when `rpc` grows session auth. Half of this surface is
not useful on its own.

## Risk intelligence (OFS-7100)

| Method | App-facing | Why |
| --- | --- | --- |
| `getWalletScreening` | Yes — `lib/live-risk.ts` | The aggregate verdict about one wallet: worst severity among current, unsuperseded flags. Someone about to deal with a stranger should be able to ask. Rendered on `/explorer/address/[address]`, which is the neutral "tell me about this wallet" surface, and never as a score this app computed. |
| `getRiskRecordsByWallet` | Yes — `lib/live-risk.ts` | The evidence under the verdict: which provider said what, when. A severity with no attribution is an accusation from nobody, and OFS-7100 makes provider registration the whole basis for taking a record seriously. |
| `sendRiskPublish` | No | Publishing a flag about somebody else is a registered Risk Intelligence Provider's action, and per `lib/earnings.ts` the governance approval that would gate it is not built. A publish button in a general-purpose wallet app is a defamation surface with no accountability behind it. |

## Providers and oracles

| Method | App-facing | Why |
| --- | --- | --- |
| `getProviderFeeQuote` | Yes — `lib/live-fee-quote.ts` | Shipped in #122 with nothing calling it. Answers "this provider bills in USDC — what is that in the token I hold", with `free`/`native`/`settleable`/`unsettleable` kept apart. Rendered on `/providers/[id]` under the declared price. `unsettleable` is never drawn as zero. |
| `getExchangeRate` | Yes — `lib/live-oracle.ts` | The node's own three-state rate answer. This app had already reimplemented §11's median client-side against `getOracleRecords`, for the stated reason that `getMedianExchangeRate` flattens "stale" and "no data" into one `null`. The node now makes that distinction itself, so one pair's rate is one call instead of ~180 records. Note: it is **not** "a single provider's rate" — it is the same median, with the reason attached. The record-level read stays for the views that need every record. |

## Notifications (OFS-6000)

| Method | App-facing | Why |
| --- | --- | --- |
| `getNotificationDispatchesByWallet` | No, today | A dispatch is created when a gateway is asked to deliver something. `lib/notifications.ts` already states the situation: this app builds no sealed destination, so no wallet using it has anywhere for a notification to go, and every wallet's list is empty for that reason. Worth building the moment sealed destinations are — it is then the honest answer to "did that alert actually reach me". |
| `getNotificationDispatch` | No | By-id read of the same thing, with no caller that the list would not already serve. |

## Content and identity

| Method | App-facing | Why |
| --- | --- | --- |
| `getContentFile` | No | Its own OpenRPC description says `GET /ipfs/{cid}` on the same host is its HTTP shape and "is what an `<img>` tag should point at". `lib/ipfs/gateway.ts` already uses that. A second, unverifiable path to the same bytes over JSON-RPC buys a browser nothing. |
| `getHeldContent` | No, but not for the same reason | This is the *trustless* read — one block, checkable against the CID's own digest. It belongs in the app the moment something here has to verify evidence rather than display it (dispute attachments). `lib/ipfs/dag.ts` walks the DAG over the gateway today. Filed as a real gap rather than declined; whoever takes dispute evidence should take this with it. |
| `getIdentityClaim` | No | By-id. Every claim this app shows was reached through `getIdentityClaimsByWallet`, which returns the whole record — there is no screen that holds a claim id without already holding the claim. |
| `getPaymentMethod` | Yes — `lib/payment-catalog.ts` | Resolves one rail id to its name. `getReferenceData` carries only `builtin:` rails, so a merchant-defined `<peer id>:<digest>` rail on a public advertisement rendered as its raw id in the order book — visible to every taker, from the moment merchant-defined rails shipped. This is the method that names it. |

---

# The other half: governance, reviews, trade exits (task #204)

Eleven methods, all of them now reached. What follows is the judgment for the
neighbouring methods that are *not*, and the two places where a surface exists
in the app but cannot be completed on devnet — which is stated on screen rather
than papered over.

## Governance (OFS-4000)

There are two proposal registers and they are not the same list. The
`openfiat-governance` program holds `Proposal` accounts keyed by a `u64` and
stores the title and summary **only as SHA-256 hashes**; every node holds
off-chain proposals keyed by an author-chosen string, carrying the actual text.
`/governance` shows both, labelled, and never merges them — a merged list would
have to invent a correspondence, and where a real one exists it is a two-sided
signed claim that `getProposalChainLink` reports.

| Method | App-facing | Why |
| --- | --- | --- |
| `getProposals` | Yes — `lib/live-proposals.ts` | The only register that carries a proposal's words. `/governance` had shown on-chain accounts alone, so every row was a hex fingerprint of a title nobody could read. |
| `getProposal` | Yes — `lib/live-proposals.ts` | `/governance/proposal/[id]`. Its own route rather than sharing `/governance/[id]` with the on-chain proposal: a `u64` PDA seed and an author-chosen string are different keys, and an off-chain id that spells a number is legal — so a single route would have to guess, and would silently show one register's proposal under the other's URL. |
| `getProposalChainLink` | Yes — `lib/live-proposals.ts`, rendered by `components/governance/chain-link-panel.tsx` | All six `ChainAgreement` verdicts are rendered distinctly. `linked_awaiting_adoption` is **not** drawn as a disagreement: every linked proposal passes through it between `tally_and_finalize` landing and the next poll tick, and calling that a divergence would make divergence meaningless. Only `linked_disagreed` is coloured as a problem. |
| `sendProposalCreate` | Yes — `lib/proposal-flow.ts`, `/governance/new` | Proven end to end against a live node in `tests/e2e/governance.spec.ts`, which reads the proposal back with `getProposal` rather than trusting the screen. |
| `sendVoteCast` | Yes — `lib/proposal-flow.ts`, `components/governance/node-vote-panel.tsx` | Reachable, and honest about what "sent" means — see below. |
| `sendProposalWithdraw` / `sendProposalActivate` | **No such method** | `openfiat-governance` has both events and `GovernanceService` originates them, but no node exposes an RPC for either. So an author cannot withdraw a proposal from any client, and `/governance/new` says so before it is filed rather than offering an undo that does not exist. |

### What a vote cannot claim, and does not

`sendVoteCast` verifies authorship synchronously and then *queues* the vote:
`poll_vote_verifications` reads the named `StakeAccount` off Solana, checks it
is owned by the staking program and belongs to this voter, and records the vote
with the amount **it** decoded. The `weight` inside the signed event is never
trusted. So the call returning cleanly means the signature was accepted and
nothing else, and a vote can still be dropped afterwards with no word back
(five minutes of retries, then abandoned).

The panel therefore says "submitted, not yet counted" and re-reads the
proposal, rather than showing a tick that would be a lie for up to five minutes
and sometimes permanently. A recorded vote's weight is labelled as the amount
the node decoded, not the amount claimed.

The local tally on a proposal page is labelled **"Votes this node has
verified"** and is explicitly not the outcome. A node with no Solana endpoint
verifies nothing, holds no votes, and would otherwise report every proposal
unanimously silent — the same reason `resolve_expired` was removed from
openfiat-core. Resolution comes from the chain's `tally_and_finalize`, which a
node adopts rather than recomputes.

### What cannot be completed on devnet

**A vote with weight.** Weight is staked OPEN and the devnet OPEN mint's
authority is permanently unset — no more can ever be issued, so a wallet
holding none can never obtain any. `NodeVotePanel` renders that state plainly
and offers no vote buttons, because a submission from a stake-less wallet would
look like it worked and then vanish. Asserted in
`tests/e2e/governance.spec.ts`.

**Creating the on-chain half.** `create_proposal` takes a stake deposit in
OPEN, so it is subject to the same constraint, and it is a separate transaction
in any case. `/governance/new` takes an on-chain proposal id if the author
already made one — which puts their half of the join key inside the signature,
where it cannot be amended — and the proposal page shows the `offchain_id_hash`
to paste into the program's `link_offchain_proposal`. Building a transaction
form no devnet wallet could ever submit was declined in favour of that.

## Reviews (OFS-3000)

| Method | App-facing | Why |
| --- | --- | --- |
| `sendReviewPublish` | Yes — `lib/review-flow.ts`, `components/reviews/review-form.tsx` | On the trade room, for a settlement in `Approved` or `Completed`. Both states, matching `openfiat_reviews::is_settled`: a gossip-only node may hold at `Approved` a trade an RPC-connected node holds at `Completed`, and a rule that answered differently per node would not be one. |
| `getMyReviews` | Yes — `lib/live-reviews.ts` | The **only** way to answer "have I reviewed this trade". The public feed carries no author and no settlement id on purpose, so nothing can match a public row to one of your own trades — a client that tried would be inventing the match. Gated on a wallet signature under `openfiat-my-reviews`, and taken on request rather than on mount. |

A review is an opinion and moves no reputation counter. `openfiat-reputation`
deliberately does not depend on `openfiat-reviews`, and the panel says so in as
many words; the two figures are never averaged together anywhere in this app.

Comments render as text, never markup — React escapes by construction, and
`lib/review-flow.ts` additionally refuses the control and bidirectional-override
characters `Review::validate` refuses, before a wallet prompt rather than after
one.

## Trade exits (OFS-2200, OFS-2300)

All four were wired at the node so that a party would not have to wait out a
30-minute window or pay to open a dispute. Every one of them is offered in
`lib/trade-actions.ts` exactly where the node will accept it, and nowhere else —
an exit offered in the wrong state is a wallet prompt followed by a refusal,
which reads as the app being broken.

| Method | App-facing | Why |
| --- | --- | --- |
| `sendReservationCancel` | Yes — `lib/trade-flow.ts` | Offered to the requester, before a settlement exists. Only they can cancel; the merchant's remedy stays the window lapsing, which is the trade they accepted when they published the advertisement. |
| `sendSettlementCancelled` | Yes — `lib/trade-flow.ts` | Either party, and only from `AwaitingPayment`. That restriction is what stops it being a theft primitive, and the confirmation copy names the window it cannot close: between a buyer's fiat leaving their bank and that buyer declaring it. |
| `sendPaymentReversed` | Yes — `lib/trade-flow.ts` | The buyer only, and only while a declaration is outstanding. Confirms first, because reversal returns the trade to `AwaitingPayment` and re-arms the merchant's cancel — a buyer whose money really has moved must dispute, not reverse. |
| `sendSettlementRejected` | Yes — `lib/trade-flow.ts` | The merchant only, and only from `PaymentSubmitted`. `discrepancy` is a required choice rather than a default, because it is the field reputation counts and everything except `Other` records a payment-accuracy fault against the buyer. |

All four verified against a live node with real signatures, including the
guards: a cancel after payment is declared comes back `INVALID_SETTLEMENT_STATE`,
and a cancel of an unknown reservation comes back `RESERVATION_NOT_FOUND`.

## Key order, which is load-bearing and silent when wrong

Every signed payload above is built in the Rust struct's field declaration
order, and each builder names the struct it mirrors. The node re-serialises with
`serde_json` — declaration order — and verifies over its own rendering;
`JSON.stringify` uses insertion order. A reordered key is a valid signature over
bytes the node never hashes, and it comes back as `INVALID_SIGNATURE`,
indistinguishable on screen from a wallet fault.

`tests/signed-key-order.test.ts` asserts the field order of all seven new
payloads against the structs they mirror. Confirmed against a live node while
writing it: moving `author` one field earlier in `ProposalCreate` is refused
with exactly that code and nothing else changes.
