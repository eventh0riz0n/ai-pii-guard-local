#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OUT_DIR="$ROOT_DIR/dist"
NAME="ai-pii-guard-local"

mkdir -p "$OUT_DIR"

ver=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ROOT_DIR/src/manifest.json','utf8')).version)")
zip_path="$OUT_DIR/${NAME}-${ver}.zip"

rm -f "$zip_path"
( cd "$ROOT_DIR/src" && zip -r "$zip_path" . -x '*.DS_Store' )

echo "Wrote: $zip_path"
