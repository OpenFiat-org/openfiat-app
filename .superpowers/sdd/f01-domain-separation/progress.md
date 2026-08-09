# SDD ledger — F-01 app phase
Branch: sdd/f01-domain-separation (openfiat-app)
App: commit 47afca2. 26 signPayload callers mapped (13 files); found 2 grep-missed (merchant-name.ts, payment-catalog.ts, NUL bytes); corrected avatar/channel-identity -> ClaimPublish; payment-catalog -> PaymentMethodDefine. vitest 707 pass/9 skip, tsc/eslint/build clean. BASE 9bb21a9.
App: review Approved — 26/26 tags verified correct, header byte-identical, literals match. IMPORTANT (fix before merge): no test asserts per-caller tag choice (tagOfSignedMessage helper unused) -> future tag-swap undetectable offline. Fixing. MINOR (follow-up): tags-in-sync-with-vectors test; PaymentMethodDefine has no vector row.
