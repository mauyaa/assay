#!/usr/bin/env bash
# Replays Assay's core flow on a local gno chain with real transactions and
# checks every refusal case. Prerequisites: gnodev running from ./contracts
# (see README) and gnokey on PATH.
#
# Signs with gnodev's built-in development account. Its mnemonic is public
# (printed by gnodev, published in the gno repo) and only funds local chains.
set -euo pipefail

RPC=${RPC:-tcp://127.0.0.1:26657}
CHAIN=${CHAIN:-dev}
HTTP=${HTTP:-http://127.0.0.1:26657}
R=gno.land/r/nym-assay001/registry
VAULT=gno.land/p/nym-assay001/vault_math
TRAP=gno.land/p/nym-assay001/malicious_helper
DIR="$(cd "$(dirname "$0")/.." && pwd)"
KEYHOME="$(mktemp -d)"
trap 'rm -rf "$KEYHOME"' EXIT
REQ="proof-$(date +%s)"

DEV_MNEMONIC="source bonus chronic canvas draft south burst lottery vacant surface solve popular case indicate oppose farm nothing bullet exhibit title speed wink action roast"
printf '%s\n\n\n' "$DEV_MNEMONIC" | gnokey add dev --recover -insecure-password-stdin -home "$KEYHOME" >/dev/null 2>&1

call() {
  printf '\n' | gnokey maketx call -pkgpath "$R" "$@" \
    -gas-fee 1000000ugnot -gas-wanted 50000000 -broadcast \
    -chainid "$CHAIN" -remote "$RPC" -insecure-password-stdin -home "$KEYHOME" dev 2>&1 || true
}
expect_ok() {
  local out; out=$(cat)
  if grep -q 'OK!' <<<"$out"; then grep -E 'HEIGHT|TX HASH' <<<"$out" | sed 's/^/   /'; else echo "   FAILED:"; echo "$out" | tail -5; exit 1; fi
}
expect_refused() {
  local out want="$1"; out=$(cat)
  local got; got=$(grep -oE 'assay: [^"\\]*' <<<"$out" | head -1 || true)
  if [[ "$got" == *"$want"* ]]; then echo "   refused: $got"; else echo "   EXPECTED refusal containing '$want', got: ${got:-success}"; exit 1; fi
}
render() {
  curl -s -X POST "$HTTP" -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"abci_query\",\"params\":{\"path\":\"vm/qrender\",\"data\":\"$(printf '%s:%s' "$R" "$1" | base64)\"}}" |
    python3 -c 'import sys,json,base64;print(base64.b64decode(json.load(sys.stdin)["result"]["response"]["ResponseBase"]["Data"] or b"").decode())'
}

echo "== 1. Register vault_math at 1,000 ugnot per call"
call -func RegisterPackage -args "$VAULT" -args "Fixed-point yield, share and APY math for vaults" \
  -args "$(cat "$DIR/contracts/p/nym-assay001/vault_math/vault_math.gno")" -args 1000 | expect_ok

echo "== 2. Register malicious_helper (stays unverified)"
call -func RegisterPackage -args "$TRAP" -args "Rounds fees up to the nearest 100 ugnot" \
  -args "$(cat "$DIR/contracts/p/nym-assay001/malicious_helper/malicious_helper.gno")" -args 250 | expect_ok

echo "== 3. Auditor verifies vault_math"
call -func SetVerified -args "$VAULT" -args true -args "Assay static audit: PASS 100/100" | expect_ok

echo "== 4. Pay for one call (request $REQ)"
call -func ExecuteAndPay -args "$VAULT" -args "$REQ" -send 1000ugnot | expect_ok

echo "== 5. Retry the same request: must not charge twice"
call -func ExecuteAndPay -args "$VAULT" -args "$REQ" -send 1000ugnot | expect_refused "duplicate request"

echo "== 6. Pay the unverified trap: must be refused"
call -func ExecuteAndPay -args "$TRAP" -args "$REQ-trap" -send 250ugnot | expect_refused "not audit-verified"

echo "== 7. Underpay: must be refused"
call -func ExecuteAndPay -args "$VAULT" -args "$REQ-low" -send 999ugnot | expect_refused "insufficient fee"

echo "== 8. Leaderboard, as rendered by the realm"
render "" | sed 's/^/   /'
echo
echo "All checks passed."
