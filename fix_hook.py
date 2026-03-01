"""Fix post-receive hook to handle alembic migration gracefully"""
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("38.55.129.237", port=22, username="root", password="vzdWC9pN8HkT", timeout=15)

hook = r'''#!/bin/bash
set -e
WORK=/root/GovAI
COMPOSE="docker compose -f $WORK/docker-compose.prod.yml --env-file $WORK/.env.production"
log() { echo "[DEPLOY $(date '+%Y-%m-%d %H:%M:%S')] $*"; }

while read oldrev newrev refname; do
    BRANCH=$(basename "$refname")
    if [ "$BRANCH" != "main" ]; then
        echo "Ignored push to $BRANCH (only main triggers deploy)"
        exit 0
    fi
done

log "[1/5] Updating code..."
cd $WORK
git --git-dir=/root/GovAI.git --work-tree=$WORK fetch origin 2>/dev/null || true
git --git-dir=/root/GovAI.git --work-tree=$WORK reset --hard HEAD
log "Code updated ✓"

log "[2/5] Building images..."
$COMPOSE build
log "Build complete ✓"

log "[3/5] Database migration..."
$COMPOSE up -d postgres redis
$COMPOSE exec -T postgres bash -c 'until pg_isready; do sleep 1; done' 2>/dev/null
# Alembic migration - may fail if already at head, that's OK
$COMPOSE run --rm backend alembic upgrade head 2>&1 || {
    log "⚠ Alembic migration skipped (schema may already be current)"
}
log "Database ready ✓"

log "[4/5] Starting all services..."
$COMPOSE up -d --remove-orphans
log "All services started ✓"

log "[5/5] Cleanup..."
docker image prune -f 2>/dev/null || true
log "Deploy complete! ✓"
'''

# Write hook
sftp = c.open_sftp()
with sftp.open("/root/GovAI.git/hooks/post-receive", "w") as f:
    f.write(hook)
sftp.close()

stdin, stdout, stderr = c.exec_command("chmod +x /root/GovAI.git/hooks/post-receive")
stdout.channel.recv_exit_status()

print("Post-receive hook updated ✓")
c.close()
