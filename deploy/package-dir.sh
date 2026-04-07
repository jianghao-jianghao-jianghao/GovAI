#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/release}"
STAMP="$(date +%Y%m%d_%H%M%S)"
PKG_NAME="GovAI_${STAMP}.tar.gz"

mkdir -p "$OUT_DIR"

required_files=(
  "$ROOT_DIR/docker-compose.prod.yml"
  "$ROOT_DIR/.env.production.example"
  "$ROOT_DIR/README.md"
)

for file in "${required_files[@]}"; do
  if [[ ! -e "$file" ]]; then
    echo "缺少必需文件: $file" >&2
    exit 1
  fi
done

tar \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='.env.production' \
  --exclude='node_modules' \
  --exclude='release' \
  --exclude='.DS_Store' \
  --exclude='*.pyc' \
  --exclude='__pycache__' \
  -czf "$OUT_DIR/$PKG_NAME" \
  -C "$ROOT_DIR" .

echo "$OUT_DIR/$PKG_NAME"
