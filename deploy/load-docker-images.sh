#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "用法: $0 <镜像目录>" >&2
  exit 1
fi

IMAGE_DIR="$1"
if [[ ! -d "$IMAGE_DIR" ]]; then
  echo "镜像目录不存在: $IMAGE_DIR" >&2
  exit 1
fi

shopt -s nullglob
archives=("$IMAGE_DIR"/*.tar.gz)
shopt -u nullglob

if [[ ${#archives[@]} -eq 0 ]]; then
  echo "镜像目录内没有 .tar.gz 文件: $IMAGE_DIR" >&2
  exit 1
fi

for archive in "${archives[@]}"; do
  echo "加载镜像: $(basename "$archive")"
  docker load -i "$archive"
done

echo "镜像加载完成"
