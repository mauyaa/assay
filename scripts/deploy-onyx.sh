#!/usr/bin/env bash
# Deploys Assay to the gno.land Onyx testnet and records every transaction.
#
#   ./scripts/deploy-onyx.sh <gnokey-key-name>
#
# Asks for the key's password once, hidden, and keeps it only in this shell.
# Safe to re-run: steps already done on chain are skipped.
# Never deploys contracts/p/nym-assay001/malicious_helper (a working drain);
# its source is only registered in the registry for the Trap Test.
set -euo pipefail

KEY=${1:?usage: deploy-onyx.sh <gnokey-key-name>}
NAME=${NAME:-nym-assay001}
# Onyx by default; override all four to rehearse on a local chain.
CHAIN=${CHAIN:-onyx-1}
REMOTE=${REMOTE:-https://rpc.onyx.testnets.gno.land:443}
RPC=${RPC:-https://rpc.onyx.testnets.gno.land}
WEB=${WEB:-https://onyx.testnets.gno.land}
R=gno.land/r/$NAME/registry
VAULT=gno.land/p/$NAME/vault_math
TRAP=gno.land/p/$NAME/malicious_helper
DIR="$(cd "$(dirname "$0")/.." && pwd)"
RECORD="$DIR/docs/deployment.json"
HOME_FLAG=()
[[ -n "${GNOKEY_HOME:-}" ]] && HOME_FLAG=(-home "$GNOKEY_HOME")

command -v gnokey >/dev/null || { echo "gnokey not found. Install: git clone https://github.com/gnolang/gno ~/gno && cd ~/gno && make install"; exit 1; }

ADDR=$(gnokey list "${HOME_FLAG[@]}" 2>/dev/null | grep -E "\. $KEY \(" | grep -oE 'g1[0-9a-z]{38}' | head -1 || true)
[[ -n "$ADDR" ]] || { echo "No key named '$KEY'. Create one with: gnokey add $KEY"; exit 1; }

abci() { # path, data -> decoded data ("" if error)
  curl -s -m 20 -X POST "$RPC" -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"abci_query\",\"params\":{\"path\":\"$1\",\"data\":\"$(printf '%s' "$2" | base64 | tr -d '\n')\"}}" |
    python3 -c 'import sys,json,base64;r=json.load(sys.stdin)["result"]["response"]["ResponseBase"];print("" if r.get("Error") else base64.b64decode(r["Data"] or b"").decode())'
}
exists() { [[ -n "$(abci vm/qfile "$1")" ]]; }
balance() { gnokey query "bank/balances/$ADDR" -remote "$REMOTE" 2>/dev/null | grep -oE '[0-9]+ugnot' | head -1 | tr -d 'ugnot' || echo 0; }

echo "Deployer: $ADDR"
BAL=$(balance); BAL=${BAL:-0}
echo "Balance:  $((BAL / 1000000)).$(printf '%06d' $((BAL % 1000000))) GNOT"
if (( BAL < 8000000 )); then
  echo
  echo "Needs at least 8 GNOT. Fund $ADDR at https://faucet.gno.land (choose Onyx), then run this again."
  exit 1
fi

read -r -s -p "Password for '$KEY': " PW; echo
TXLOG=$(mktemp); trap 'rm -f "$TXLOG"' EXIT

tx() { # label, then gnokey maketx args
  local label=$1; shift
  echo "== $label"
  local out
  out=$(printf '%s\n' "$PW" | gnokey maketx "$@" -broadcast -chainid "$CHAIN" -remote "$REMOTE" \
        -insecure-password-stdin "${HOME_FLAG[@]}" "$KEY" 2>&1) || true
  if grep -q 'OK!' <<<"$out"; then
    local h t; h=$(grep -oE 'HEIGHT: +[0-9]+' <<<"$out" | grep -oE '[0-9]+'); t=$(grep -oE 'TX HASH: +\S+' <<<"$out" | awk '{print $3}')
    echo "   height $h  tx $t"
    printf '%s\t%s\t%s\n' "$label" "$h" "$t" >>"$TXLOG"
  else
    local why; why=$(grep -m1 -E '^Data: ' <<<"$out" | sed 's/^Data: //' | cut -c1-200 || true)
    echo "   FAILED: ${why:-see output below}"
    if grep -q 'username for this address already registered' <<<"$out"; then
      echo "   This key already owns a gno.land username, and an address can only own one."
      echo "   Use a fresh key (gnokey add assay-deployer), fund it, and run this again."
    fi
    [[ -n "$why" ]] || echo "$out" | grep -vE '^\s*$' | tail -8
    exit 1
  fi
}
call() { local label=$1; shift; tx "$label" call -gas-wanted 30000000 -gas-fee 100000ugnot -max-deposit 3000000ugnot "$@"; }

# 1. Namespace (SKIP_NAMESPACE=1 only for local rehearsals; local chains don't enforce names)
if [[ "${SKIP_NAMESPACE:-}" != 1 ]]; then
OWNER=$(abci vm/qeval "gno.land/r/sys/users.ResolveName(\"$NAME\")")
if grep -q "$ADDR" <<<"$OWNER"; then echo "== Namespace $NAME already yours"
elif [[ -z "$OWNER" ]] || grep -q 'nil' <<<"$OWNER"; then # empty: users realm not loaded yet; the chain decides
  call "Register namespace $NAME" -pkgpath gno.land/r/sys/namereg/v0 -func Register -args "$NAME"
else echo "Namespace $NAME belongs to someone else. Re-run with NAME=nym-<letters><3 digits>."; exit 1; fi
fi

# 2. Packages
if exists "$VAULT"; then echo "== $VAULT already deployed"
else tx "Deploy $VAULT" addpkg -pkgpath "$VAULT" -pkgdir "$DIR/contracts/p/$NAME/vault_math" -gas-wanted 100000000 -gas-fee 200000ugnot -max-deposit 5000000ugnot; fi
if exists "$R"; then echo "== $R already deployed"
else tx "Deploy $R" addpkg -pkgpath "$R" -pkgdir "$DIR/contracts/r/$NAME/registry" -gas-wanted 150000000 -gas-fee 300000ugnot -max-deposit 10000000ugnot; fi

# 3. Registry contents
LISTED=$(abci vm/qrender "$R:api/packages")
grep -q "\"path\":\"$VAULT\"" <<<"$LISTED" || call "Register $VAULT" -pkgpath "$R" -func RegisterPackage \
  -args "$VAULT" -args "Fixed-point yield, share and APY math for vaults" -args "$(cat "$DIR/contracts/p/$NAME/vault_math/vault_math.gno")" -args 1000
grep -q "\"path\":\"$TRAP\"" <<<"$LISTED" || call "Register $TRAP (source only, not deployed)" -pkgpath "$R" -func RegisterPackage \
  -args "$TRAP" -args "Rounds fees up to the nearest 100 ugnot" -args "$(cat "$DIR/contracts/p/$NAME/malicious_helper/malicious_helper.gno")" -args 250
grep -q "\"path\":\"$VAULT\"[^}]*\"verified\":true" <<<"$(abci vm/qrender "$R:api/packages")" || \
  call "Verify $VAULT" -pkgpath "$R" -func SetVerified -args "$VAULT" -args true -args "Assay static audit: PASS 100/100"

# 4. One real paid call
REQ="deploy-$(date +%s)"
call "Pay for one call of $VAULT (request $REQ)" -pkgpath "$R" -func ExecuteAndPay -args "$VAULT" -args "$REQ" -send 1000ugnot
RECEIPT=$(abci vm/qeval "$R.ReceiptFor(\"$ADDR\",\"$REQ\")" | grep -oE '^\([0-9]+' | tr -d '(')

# 5. Record
COMMIT=$(git -C "$DIR" rev-parse HEAD 2>/dev/null || echo "uncommitted")
python3 - "$TXLOG" "$RECORD" <<PY
import json, sys, datetime
import os
rows = [l.rstrip("\n").split("\t") for l in open(sys.argv[1]) if l.strip()]
txs = [{"step": s, "height": int(h), "tx_hash": t} for s, h, t in rows]
# Keep transactions from earlier runs against the same network (resumed deploys).
if os.path.exists(sys.argv[2]):
    old = json.load(open(sys.argv[2]))
    if old.get("network") == "$CHAIN" and old.get("deployer") == "$ADDR":
        seen = {t["tx_hash"] for t in txs}
        txs = [t for t in old.get("transactions", []) if t["tx_hash"] not in seen] + txs
json.dump({
  "network": "$CHAIN", "rpc": "$RPC", "deployer": "$ADDR", "namespace": "$NAME",
  "realm": "$R", "packages": ["$VAULT"], "registered_not_deployed": ["$TRAP"],
  "source_commit": "$COMMIT", "deployed_at": datetime.datetime.utcnow().isoformat() + "Z",
  "receipt": {"id": int("${RECEIPT:-0}" or 0), "request_id": "$REQ", "url": "$WEB/r/$NAME/registry:receipt/${RECEIPT:-0}"},
  "transactions": sorted(txs, key=lambda t: t["height"]),
  "links": {"leaderboard": "$WEB/r/$NAME/registry", "vault_math": "$WEB/p/$NAME/vault_math", "realm_source": "$WEB/r/$NAME/registry\$source"},
}, open(sys.argv[2], "w"), indent=2)
PY
echo
echo "Done. Receipt #${RECEIPT:-?}: $WEB/r/$NAME/registry:receipt/${RECEIPT:-0}"
echo "Leaderboard: $WEB/r/$NAME/registry"
echo "Record written to docs/deployment.json"
