#!/usr/bin/env bash
# Usage: ./deploy.sh [branch]   (default "test" -> preview URL only; use "main" for production)
set -euo pipefail
cd "$(dirname "$0")"
BRANCH="${1:-test}"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
cp -r index.html style.css js vendor es "$OUT"/
../fetcher/node_modules/.bin/wrangler pages deploy "$OUT" --project-name laceibona-weather --branch "$BRANCH" --commit-dirty=true
