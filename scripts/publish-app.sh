#!/usr/bin/env bash
# Build the app and publish it to GitHub Pages (gh-pages branch).
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
REPO=$(basename -s .git "$(git remote get-url origin)")
OFFLINE=1 npm test >/dev/null
BASE_PATH="/$REPO" npm run build >/dev/null
touch web/out/.nojekyll # serve the _next/ folder as-is
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
cp -R web/out/. "$TMP"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$DIR" config user.name)" -c user.email="$(git -C "$DIR" config user.email)" \
  commit -q -m "Publish app from $(git -C "$DIR" rev-parse --short HEAD)"
git push -q -f "$(git -C "$DIR" remote get-url origin)" gh-pages
echo "Published: https://$(git -C "$DIR" remote get-url origin | sed -E 's#.*github.com[:/]([^/]+)/.*#\1#').github.io/$REPO/"
