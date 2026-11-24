#!/usr/bin/env bash
# Captures README screenshots from the running app with headless Chrome.
# Usage: start the app (npm run dev), then: ./scripts/screenshots.sh [base-url]
set -euo pipefail
BASE=${1:-http://localhost:3000}
OUT="$(cd "$(dirname "$0")/.." && pwd)/docs/img"
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE"' EXIT
mkdir -p "$OUT"

shot() { # name, query, extra chrome flags...
  local name=$1 query=$2; shift 2
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE" \
    --window-size=1440,900 --force-prefers-reduced-motion --run-all-compositor-stages-before-draw --virtual-time-budget=20000 "$@" \
    --screenshot="$OUT/$name.png" "$BASE/?$query" >/dev/null 2>&1
  echo "  docs/img/$name.png"
}

echo "Capturing from $BASE"
LIGHT=--blink-settings=preferredColorScheme=1
DARK=--blink-settings=preferredColorScheme=0
shot trap-rejected "pkg=gno.land/p/nym-assay001/malicious_helper&audit=1" $LIGHT
shot clean-passed  "pkg=gno.land/p/nym-assay001/vault_math&audit=1" $LIGHT
shot dark          "pkg=gno.land/p/nym-assay001/malicious_helper&audit=1" $DARK
