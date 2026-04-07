#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="${1:-$ROOT_DIR/release/runtime_state_$STAMP}"

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-govai-postgres}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-govai-backend}"
POSTGRES_USER="${POSTGRES_USER:-govai_user}"
POSTGRES_DB="${POSTGRES_DB:-govai_db}"

mkdir -p "$OUT_DIR/uploads"

docker exec "$POSTGRES_CONTAINER" sh -lc "rm -f /tmp/govai_db.dump && pg_dump -U '$POSTGRES_USER' -d '$POSTGRES_DB' -Fc -f /tmp/govai_db.dump"
docker cp "$POSTGRES_CONTAINER:/tmp/govai_db.dump" "$OUT_DIR/govai_db.dump"
docker exec "$POSTGRES_CONTAINER" rm -f /tmp/govai_db.dump

docker cp "$BACKEND_CONTAINER:/app/uploads/." "$OUT_DIR/uploads/"

echo "$OUT_DIR"
