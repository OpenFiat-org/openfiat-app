#!/usr/bin/env bash
# Stale-literal guard for the 2026-08-09 OPEN tokenomics re-baseline
# (OFS-4100 §1-4: 100,000,000,000 OPEN supply at 6 decimals, presale
# 1 USDC = 100 OPEN, public-sale phase-2 1 USDC = 80 OPEN).
#
# Repo-local adaptation of openfiat-core/scripts/check-stale-tokenomics-literals.sh
# (same pattern set), for this app's own tree.
#
# User-facing copy and code comments must not ASSERT a pre-rebaseline figure
# (1B total supply, 200,000,000 OPEN presale bucket, "1 OPEN = 1 USDC" / 1:1
# price, OPEN at nine decimals) as current. A match is allowed only if its
# file is listed in ALLOWLIST below, with a reason. Everything else is a
# regression this guard fails on.
#
# The ALLOWLIST here is deliberately narrow and filename-explicit: these are
# the exact files the 2026-08-09 doc sweep (task 5) left holding old-figure
# literals on purpose, because they mirror the presale/staking programs as
# CURRENTLY deployed on devnet (old mint: 9 decimals, no open_per_usdc rate
# field, StakingConfig not yet re-applied to the new minimums) rather than
# the re-baselined specification. Updating their numbers before that
# redeploy actually happens would make them describe a cluster that does
# not exist. See each file's own doc comments for the full reasoning.
#
# Usage: scripts/check-stale-tokenomics-literals.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ALLOWLIST=(
  # Hardcode OPEN's decimals for on-chain reads/writes (stake, unstake,
  # governance proposal amounts). The live OPEN SPL mint on devnet was
  # created with 9 decimals, and decimals are immutable post-creation, so
  # 9 is what these must use against the mint that actually exists today.
  "components/staking/stake-form.tsx"
  "lib/proposal-display.ts"
  "lib/staking-roles.ts"
  # Asserts the live StakingConfig's CURRENT on-chain minimums (500 OPEN
  # Merchant/Arbitrator, not the re-baselined 100,000/500,000), because
  # apply-devnet-staking-floors.ts has not yet been run against this
  # cluster (see openfiat-core Task 3/4b). Will be swept once it has.
  "tests/e2e/no-fabricated-data.spec.ts"
)

# Old-figure signatures. Each names OPEN or USDC explicitly so it can't
# false-positive on an unrelated ratio or SOL/wSOL's genuinely-correct nine
# decimals elsewhere in the app.
PATTERNS=(
  '1,000,000,000 OPEN'
  '200,000,000 OPEN'
  '1 OPEN = 1 USDC'
  'OPEN.{0,20}1:1'
  '1:1.{0,20}OPEN'
  'minted 1:1'
  'OPEN has 9 decimals'
  'OPEN.{0,40}(nine|9) decimal'
  '(nine|9) decimal.{0,40}OPEN'
)

is_allowed() {
  local file="$1"
  for a in "${ALLOWLIST[@]}"; do
    [ "$file" = "$a" ] && return 0
  done
  return 1
}

fail=0
for pattern in "${PATTERNS[@]}"; do
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    file="${line%%:*}"
    file="${file#./}"
    if ! is_allowed "$file"; then
      echo "STALE TOKENOMICS LITERAL: $line"
      fail=1
    fi
  done < <(grep -rnE \
    --include='*.md' --include='*.ts' --include='*.tsx' --include='*.json' \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git \
    -- "$pattern" . 2>/dev/null || true)
done

if [ "$fail" -ne 0 ]; then
  cat >&2 <<'EOF'

One or more files assert a pre-2026-08-09-rebaseline OPEN tokenomics figure
(1B supply, 200,000,000 OPEN presale bucket, 1:1 price, 9 decimals) as
current. Either update it to the re-baselined figure (100,000,000,000
supply, 100:1 presale rate / 80:1 phase-2, 6 decimals) or, if it is a
genuinely still-live-cluster-accurate reference, add it to ALLOWLIST in
this script with a reason.
EOF
  exit 1
fi

echo "OK: no stale pre-rebaseline tokenomics literals found outside the allowlist."
