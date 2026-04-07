#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d_%H%M%S)"
BUNDLE_DIR="${1:-$ROOT_DIR/release/offline_bundle_$STAMP}"
ARTIFACTS_DIR="$BUNDLE_DIR/artifacts"
IMAGES_DIR="$BUNDLE_DIR/images"
ENV_DIR="$BUNDLE_DIR/env"
DOCS_DIR="$BUNDLE_DIR/docs"
RUNTIME_DIR="$BUNDLE_DIR/runtime_state"

mkdir -p "$ARTIFACTS_DIR" "$IMAGES_DIR" "$ENV_DIR" "$DOCS_DIR"

echo "打包项目代码..."
CODE_ARCHIVE="$("$ROOT_DIR/deploy/package-dir.sh" "$ARTIFACTS_DIR")"
echo "导出运行数据..."
"$ROOT_DIR/deploy/export-runtime-state.sh" "$RUNTIME_DIR"
echo "导出 Docker 镜像..."
"$ROOT_DIR/deploy/export-docker-images.sh" "$IMAGES_DIR"

cp "$ROOT_DIR/.env.production.example" "$ENV_DIR/"
if [[ -f "$ROOT_DIR/.env.production" ]]; then
  cp "$ROOT_DIR/.env.production" "$ENV_DIR/"
fi

cp "$ROOT_DIR/doc/离线部署说明.md" "$DOCS_DIR/"

GIT_COMMIT="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
{
  echo "bundle_created_at=$(date --iso-8601=seconds)"
  echo "project_dir=$ROOT_DIR"
  echo "git_commit=$GIT_COMMIT"
  echo "code_archive=$(basename "$CODE_ARCHIVE")"
  echo "runtime_state_dir=$(basename "$RUNTIME_DIR")"
  echo "images_dir=$(basename "$IMAGES_DIR")"
  echo "env_dir=$(basename "$ENV_DIR")"
  echo "docs_dir=$(basename "$DOCS_DIR")"
} > "$BUNDLE_DIR/BUNDLE_MANIFEST.txt"

(
  cd "$BUNDLE_DIR"
  find . -type f ! -name SHA256SUMS.txt -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS.txt
)

FINAL_TARBALL="${BUNDLE_DIR}.tar.gz"
echo "压缩离线交付目录..."
tar -czf "$FINAL_TARBALL" -C "$(dirname "$BUNDLE_DIR")" "$(basename "$BUNDLE_DIR")"

echo "$FINAL_TARBALL"
