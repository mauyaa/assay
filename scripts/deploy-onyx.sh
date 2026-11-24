#!/usr/bin/env bash
# Deploy Assay to Onyx: ./scripts/deploy-onyx.sh <gnokey-key>
# Re-runnable: finished steps are skipped. malicious_helper is registered, never deployed.
set -euo pipefail

KEY=${1:?usage: deploy-onyx.sh <gnokey-key>}
NAME=${NAME:-nym-assay001}
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

command -v gnokey >/dev/null || { echo "gnokey not found: https://docs.gno.land/builders/install"; exit 1; }
ADDR=$(gnokey list ${HOME_FLAG[@]+"${HOME_FLAG[@]}"} 2>/dev/null | grep -E "\. $KEY \(" | grep -oE 'g1[0-9a-z]{38}' | head -1 || true)
[[ -n "$ADDR" ]] || { echo "No key '$KEY'. Create it: gnokey add $KEY"; exit 1; }

abci() { # path data -> decoded result, or "" on error
  curl -s -m 20 -X POST "$RPC" -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"abci_query\",\"params\":{\"path\":\"$1\",\"data\":\"$(printf '%s' "$2" | base64 | tr -d '\n')\"}}" |
    python3 -c 'import sys,json,base64;r=json.load(sys.stdin)["result"]["response"]["ResponseBase"];print("" if r.get("Error") else base64.b64decode(r["Data"] or b"").decode())'
}
status() { # live | inert | none
  local s; s=$(abci vm/qpkgmeta_json "$1" | python3 -c 'import sys,json;print(json.loads(sys.stdin.read() or "{}").get("status",""))' 2>/dev/null || true)
  if [[ -n "$s" ]]; then echo "$s"; elif [[ -n "$(abci vm/qfile "$1")" ]]; then echo live; else echo none; fi
}

TXLOG=$(mktemp)
save() { # merge this run's transactions into the record
  [[ -s "$TXLOG" ]] || { rm -f "$TXLOG"; return; }
  python3 - "$TXLOG" "$RECORD" <<PY
import json, os, sys
new = [dict(zip(("step", "height", "tx_hash"), l.rstrip("\n").split("\t"))) for l in open(sys.argv[1]) if l.strip()]
for t in new: t["height"] = int(t["height"])
rec = json.load(open(sys.argv[2])) if os.path.exists(sys.argv[2]) else {}
if rec.get("network") != "$CHAIN" or rec.get("deployer") != "$ADDR":
    rec = {"network": "$CHAIN", "deployer": "$ADDR", "realm": "$R", "packages": ["$VAULT"], "registered_only": ["$TRAP"], "transactions": []}
seen = {t["tx_hash"] for t in new}
rec["transactions"] = sorted([t for t in rec["transactions"] if t["tx_hash"] not in seen] + new, key=lambda t: t["height"])
rec["source_commit"] = os.popen("git -C '$DIR' rev-parse HEAD 2>/dev/null").read().strip()
json.dump(rec, open(sys.argv[2], "w"), indent=2)
PY
  rm -f "$TXLOG"
}
trap save EXIT

BAL=$(gnokey query "bank/balances/$ADDR" -remote "$REMOTE" 2>/dev/null | grep -oE '[0-9]+ugnot' | head -1 | tr -d 'ugnot' || true)
echo "$ADDR · $(( ${BAL:-0} / 1000000 )) GNOT"
(( ${BAL:-0} >= 8000000 )) || { echo "Needs 8 GNOT: https://faucet.gno.land (Onyx)"; exit 1; }

read -r -s -p "Password for $KEY: " PW; echo

tx() { # label, gnokey maketx args...
  local label=$1 out; shift
  echo "· $label"
  out=$(printf '%s\n' "$PW" | gnokey maketx "$@" -broadcast -chainid "$CHAIN" -remote "$REMOTE" \
        -insecure-password-stdin ${HOME_FLAG[@]+"${HOME_FLAG[@]}"} "$KEY" 2>&1) || true
  if grep -q 'OK!' <<<"$out"; then
    local h t; h=$(grep -oE 'HEIGHT: +[0-9]+' <<<"$out" | grep -oE '[0-9]+'); t=$(grep -oE 'TX HASH: +\S+' <<<"$out" | awk '{print $3}')
    echo "  $h $t"; printf '%s\t%s\t%s\n' "$label" "$h" "$t" >>"$TXLOG"
  else
    echo "  failed: $(grep -m1 -E '^Data: ' <<<"$out" | sed 's/^Data: //' | cut -c1-160)"
    grep -q 'already registered' <<<"$out" && echo "  This key already owns a username. Use a fresh key."
    exit 1
  fi
}
call() { local label=$1; shift; tx "$label" call -gas-wanted 30000000 -gas-fee 100000ugnot -max-deposit 3000000ugnot "$@"; }

if [[ "${SKIP_NAMESPACE:-}" != 1 ]]; then # local chains don't enforce names
  OWNER=$(abci vm/qeval "gno.land/r/sys/users.ResolveName(\"$NAME\")")
  if ! grep -q "$ADDR" <<<"$OWNER"; then
    [[ -z "$OWNER" ]] || grep -q nil <<<"$OWNER" || { echo "$NAME is taken. Run with NAME=nym-<letters><3 digits>."; exit 1; }
    call "Register $NAME" -pkgpath gno.land/r/sys/namereg/v0 -func Register -args "$NAME"
  fi
fi

[[ $(status "$VAULT") == none ]] && tx "Deploy $VAULT" addpkg -pkgpath "$VAULT" -pkgdir "$DIR/contracts/p/$NAME/vault_math" -gas-wanted 100000000 -gas-fee 200000ugnot -max-deposit 5000000ugnot
[[ $(status "$R") == none ]] && tx "Deploy $R" addpkg -pkgpath "$R" -pkgdir "$DIR/contracts/r/$NAME/registry" -gas-wanted 150000000 -gas-fee 300000ugnot -max-deposit 10000000ugnot

if [[ $(status "$VAULT") != live || $(status "$R") != live ]]; then
  echo "Deployed. Waiting for Onyx package approval; run again once approved."
  exit 0
fi

LISTED=$(abci vm/qrender "$R:api/packages")
grep -q "\"path\":\"$VAULT\"" <<<"$LISTED" || call "Register $VAULT" -pkgpath "$R" -func RegisterPackage \
  -args "$VAULT" -args "Fixed-point yield, share and APY math for vaults" -args "$(cat "$DIR/contracts/p/$NAME/vault_math/vault_math.gno")" -args 1000
grep -q "\"path\":\"$TRAP\"" <<<"$LISTED" || call "Register $TRAP" -pkgpath "$R" -func RegisterPackage \
  -args "$TRAP" -args "Rounds fees up to the nearest 100 ugnot" -args "$(cat "$DIR/contracts/p/$NAME/malicious_helper/malicious_helper.gno")" -args 250
grep -q "\"path\":\"$VAULT\"[^}]*\"verified\":true" <<<"$(abci vm/qrender "$R:api/packages")" || \
  call "Verify $VAULT" -pkgpath "$R" -func SetVerified -args "$VAULT" -args true -args "Assay audit: pass"

REQ="deploy-$(date +%s)"
call "Pay $VAULT ($REQ)" -pkgpath "$R" -func ExecuteAndPay -args "$VAULT" -args "$REQ" -send 1000ugnot
ID=$(abci vm/qeval "$R.ReceiptFor(\"$ADDR\",\"$REQ\")" | grep -oE '^\([0-9]+' | tr -d '(')
echo "Receipt: $WEB/r/$NAME/registry:receipt/$ID"
