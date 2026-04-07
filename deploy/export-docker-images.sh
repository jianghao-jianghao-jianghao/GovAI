#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="${1:-$ROOT_DIR/release/docker_images_$STAMP}"
shift || true

mkdir -p "$OUT_DIR"

if (( $# > 0 )); then
  IMAGES=("$@")
else
  IMAGES=(
    "govai-postgres:latest"
    "redis:7-alpine"
    "govai-converter:latest"
    "govai-backend:latest"
    "nginx:latest"
  )
  if docker image inspect node:18-alpine >/dev/null 2>&1; then
    IMAGES+=("node:18-alpine")
  fi
fi

MANIFEST_FILE="$OUT_DIR/image-manifest.txt"
: > "$MANIFEST_FILE"

for image in "${IMAGES[@]}"; do
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    echo "缺少镜像: $image" >&2
    exit 1
  fi

  safe_name="${image//\//_}"
  safe_name="${safe_name//:/_}"
  archive_path="$OUT_DIR/${safe_name}.tar.gz"
  image_id="$(docker image inspect "$image" --format '{{.Id}}')"
  created_at="$(docker image inspect "$image" --format '{{.Created}}')"
  image_size="$(docker image inspect "$image" --format '{{.Size}}')"

  echo "导出镜像: $image -> $(basename "$archive_path")"
  docker save "$image" | gzip -1 > "$archive_path"

  {
    echo "image=$image"
    echo "image_id=$image_id"
    echo "created_at=$created_at"
    echo "size_bytes=$image_size"
    echo "archive=$(basename "$archive_path")"
    echo
  } >> "$MANIFEST_FILE"
done

(
  cd "$OUT_DIR"
  sha256sum ./*.tar.gz > SHA256SUMS.txt
)

echo "$OUT_DIR"
