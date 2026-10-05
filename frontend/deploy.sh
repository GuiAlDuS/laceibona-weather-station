#!/usr/bin/env bash
# Usage: ./deploy.sh [branch]   (default "test" -> preview URL only; use "main" for production)
set -euo pipefail
cd "$(dirname "$0")"
BRANCH="${1:-test}"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
cp -r index.html sensor-correction.html style.css js vendor es img "$OUT"/
# The footer's "code last updated" line: the commit's time, or the deploy time when the tree has uncommitted changes.
COMMIT="$(git rev-parse HEAD)"
if [ -n "$(git status --porcelain -- .)" ]; then
  printf '{"commit":"%s","updated":"%s","uncommitted":true}\n' "$COMMIT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$OUT/build.json"
else
  printf '{"commit":"%s","updated":"%s","uncommitted":false}\n' "$COMMIT" "$(git log -1 --format=%cI)" > "$OUT/build.json"
fi
../fetcher/node_modules/.bin/wrangler pages deploy "$OUT" --project-name laceibona-weather --branch "$BRANCH" --commit-dirty=true
