"""
Setup public server (38.55.129.237) with:
1. Git bare repo + post-receive auto-deploy hook
2. Fix .env.production with correct SERVER_IP
"""
import paramiko
import time

HOST = "38.55.129.237"
USER = "root"
PASSWORD = "vzdWC9pN8HkT"

def ssh_exec(cmd, timeout=300):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=60,
                   allow_agent=False, look_for_keys=False)
    print(f"\n[CMD] {cmd[:120]}{'...' if len(cmd)>120 else ''}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    code = stdout.channel.recv_exit_status()
    if out.strip():
        for line in out.strip().split('\n')[:30]:
            print(f"  {line}")
    if err.strip():
        for line in err.strip().split('\n')[:10]:
            print(f"  [ERR] {line}")
    if code != 0:
        print(f"  [EXIT={code}]")
    client.close()
    return out, err, code

def ssh_upload(remote_path, content):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=60,
                   allow_agent=False, look_for_keys=False)
    sftp = client.open_sftp()
    with sftp.open(remote_path, 'w') as f:
        f.write(content)
    sftp.close()
    client.close()
    print(f"  Uploaded: {remote_path}")

def main():
    # ── Step 1: Initialize git bare repo on server ──
    print("=== Step 1: Create Git bare repo ===")
    ssh_exec("test -d /root/GovAI.git && echo EXISTS || git init --bare /root/GovAI.git")

    # ── Step 2: Setup work dir as git repo pointing to bare repo ──
    print("\n=== Step 2: Initialize work dir as git clone ===")
    ssh_exec("""
cd /root/GovAI && \
if [ -d .git ]; then
    echo "Already a git repo"
    git remote set-url origin /root/GovAI.git 2>/dev/null || git remote add origin /root/GovAI.git
else
    git init && \
    git remote add origin /root/GovAI.git 2>/dev/null || git remote set-url origin /root/GovAI.git
fi && \
git add -A && \
git -c user.name='deploy' -c user.email='deploy@govai' commit -m 'initial deploy' --allow-empty && \
git push -u origin main --force
""")

    # ── Step 3: Create post-receive hook ──
    print("\n=== Step 3: Create post-receive hook ===")
    hook_content = r'''#!/usr/bin/env bash
set -euo pipefail
unset GIT_DIR

WORK_DIR="/root/GovAI"
COMPOSE_FILE="$WORK_DIR/docker-compose.prod.yml"
ENV_FILE="$WORK_DIR/.env.production"
LOG_FILE="$WORK_DIR/deploy/deploy.log"

mkdir -p "$WORK_DIR/deploy"

log() { echo "[DEPLOY $(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

while read oldrev newrev refname; do
    BRANCH=$(echo "$refname" | sed 's|refs/heads/||')
    if [ "$BRANCH" != "main" ]; then
        echo "Skip non-main branch: $BRANCH"
        continue
    fi

    log "========================================="
    log "Received push to main, deploying..."
    log "Commit: $(echo $newrev | cut -c1-8)"
    log "========================================="

    # 1. Update work dir
    log "[1/5] Updating code..."
    cd "$WORK_DIR"
    git fetch origin main 2>&1 | tee -a "$LOG_FILE"
    git reset --hard origin/main 2>&1 | tee -a "$LOG_FILE"
    log "Code updated ✓"

    # 2. Check env file
    if [ ! -f "$ENV_FILE" ]; then
        log "ERROR: .env.production missing!"
        exit 1
    fi

    # 3. Build images
    log "[2/5] Building Docker images..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build 2>&1 | tee -a "$LOG_FILE"
    log "Build complete ✓"

    # 4. DB migration
    log "[3/5] Database migration..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres redis 2>&1 | tee -a "$LOG_FILE"
    sleep 10
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm \
        backend alembic upgrade head 2>&1 | tee -a "$LOG_FILE" || {
        log "[WARN] Migration skipped"
    }
    log "Migration complete"

    # 5. Start services
    log "[4/5] Starting services..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --remove-orphans 2>&1 | tee -a "$LOG_FILE"
    log "Services started"

    # 6. Cleanup
    log "[5/5] Cleanup..."
    docker image prune -f 2>&1 | tee -a "$LOG_FILE"

    log ""
    log "=== Deploy complete! ==="
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps 2>&1 | tee -a "$LOG_FILE"
    log "Access: http://38.55.129.237"
    log "========================================="
done
'''
    ssh_upload('/root/GovAI.git/hooks/post-receive', hook_content)
    ssh_exec("chmod +x /root/GovAI.git/hooks/post-receive")

    # ── Step 4: Fix .env.production SERVER_IP ──
    print("\n=== Step 4: Fix .env.production SERVER_IP ===")
    env_content = """# GovAI Production Environment - Public Server
SERVER_IP=38.55.129.237
FRONTEND_PORT=80

POSTGRES_USER=govai_user
POSTGRES_PASSWORD=govai_prod_pwd_2026
POSTGRES_DB=govai_db

REDIS_PASSWORD=govai_redis_prod_2026

JWT_SECRET_KEY=govai-prod-xK9mP2vL7qR4wT8nJ3yB6cF1hA5sD0eZz

DIFY_MOCK=true
DIFY_API_PORT=5001
DIFY_BASE_URL=http://host.docker.internal:5001/v1
DIFY_DATASET_API_KEY=dataset-placeholder
DIFY_APP_DOC_DRAFT_KEY=app-placeholder
DIFY_APP_DOC_CHECK_KEY=app-placeholder
DIFY_APP_DOC_OPTIMIZE_KEY=app-placeholder
DIFY_APP_CHAT_KEY=app-placeholder
DIFY_APP_ENTITY_EXTRACT_KEY=app-placeholder
DIFY_APP_DOC_FORMAT_KEY=app-placeholder
DIFY_APP_DOC_DIAGNOSE_KEY=app-placeholder
DIFY_APP_PUNCT_FIX_KEY=app-placeholder
"""
    ssh_upload('/root/GovAI/.env.production', env_content)

    print("\n=== Step 5: Verify setup ===")
    ssh_exec("ls -la /root/GovAI.git/hooks/post-receive")
    ssh_exec("head -3 /root/GovAI/.env.production")
    ssh_exec("git -C /root/GovAI.git branch")

    print("\n=== Setup complete! ===")
    print("Public server bare repo: /root/GovAI.git")
    print("Work dir: /root/GovAI")
    print("post-receive hook installed")

if __name__ == "__main__":
    main()
