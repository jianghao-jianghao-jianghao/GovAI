#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "用法: $0 <运行态目录>" >&2
  exit 1
fi

STATE_DIR="$1"
if [[ ! -d "$STATE_DIR" ]]; then
  echo "运行态目录不存在: $STATE_DIR" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env.production}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-govai}"

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-govai-postgres}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-govai-backend}"
POSTGRES_USER="${POSTGRES_USER:-$(awk -F= '$1=="POSTGRES_USER"{print $2}' "$ENV_FILE")}"
POSTGRES_DB="${POSTGRES_DB:-$(awk -F= '$1=="POSTGRES_DB"{print $2}' "$ENV_FILE")}"

if [[ -z "$POSTGRES_USER" || -z "$POSTGRES_DB" ]]; then
  echo "无法从 $ENV_FILE 读取 POSTGRES_USER/POSTGRES_DB" >&2
  exit 1
fi

docker compose \
  -p "$COMPOSE_PROJECT_NAME" \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  up -d --no-build postgres redis converter backend frontend

for _ in $(seq 1 60); do
  if docker exec "$POSTGRES_CONTAINER" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! docker exec "$POSTGRES_CONTAINER" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
  echo "PostgreSQL 未就绪，无法导入运行数据" >&2
  exit 1
fi

if [[ -f "$STATE_DIR/govai_db.dump" ]]; then
  echo "导入数据库备份..."
  docker cp "$STATE_DIR/govai_db.dump" "$POSTGRES_CONTAINER:/tmp/govai_db.dump"
  docker exec "$POSTGRES_CONTAINER" sh -lc \
    "pg_restore -U '$POSTGRES_USER' -d '$POSTGRES_DB' --clean --if-exists --no-owner --no-privileges /tmp/govai_db.dump"
  docker exec "$POSTGRES_CONTAINER" rm -f /tmp/govai_db.dump
fi

if [[ -d "$STATE_DIR/uploads" ]]; then
  echo "导入上传文件..."
  docker exec "$BACKEND_CONTAINER" sh -lc 'rm -rf /app/uploads/* && mkdir -p /app/uploads'
  docker cp "$STATE_DIR/uploads/." "$BACKEND_CONTAINER:/app/uploads/"
fi

docker compose \
  -p "$COMPOSE_PROJECT_NAME" \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  restart backend frontend

echo "运行数据导入完成"
