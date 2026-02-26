#!/usr/bin/env bash
# ============================================================
# 在内网服务器上初始化 Git 裸仓库 + 自动部署钩子
#
# 使用方法（在服务器上执行）：
#   bash deploy/setup-server.sh
#
# 原理：
#   1. 创建一个 Git 裸仓库 ~/GovAI.git（接收 push）
#   2. 创建工作目录 ~/GovAI（checkout + 部署）
#   3. 设置 post-receive 钩子：收到 push 后自动构建部署
# ============================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[SETUP $(date '+%H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*"; }

BARE_REPO="$HOME/GovAI.git"
WORK_DIR="$HOME/GovAI"
DEPLOY_LOG="$WORK_DIR/deploy/deploy.log"

cat << 'BANNER'
╔═══════════════════════════════════════════════════════════╗
║      GovAI — 内网服务器部署环境初始化                      ║
║      Git 裸仓库 + post-receive 自动部署                    ║
╚═══════════════════════════════════════════════════════════╝
BANNER
echo ""

# ── 第1步：检查前置条件 ──
log "步骤 1/4：检查前置条件..."

if ! command -v docker &>/dev/null; then
    err "Docker 未安装"; exit 1
fi
if ! docker compose version &>/dev/null; then
    err "Docker Compose (V2) 未安装"; exit 1
fi
if ! command -v git &>/dev/null; then
    err "Git 未安装"; exit 1
fi

log "Docker $(docker --version | grep -oP '\d+\.\d+\.\d+')"
log "Docker Compose $(docker compose version --short)"
log "Git $(git --version | grep -oP '\d+\.\d+\.\d+')"
log "前置检查通过 ✓"

# ── 第2步：创建 Git 裸仓库 ──
log "步骤 2/4：创建 Git 裸仓库..."

if [ -d "$BARE_REPO" ]; then
    warn "裸仓库已存在: $BARE_REPO，跳过创建"
else
    git init --bare "$BARE_REPO"
    log "裸仓库创建完成: $BARE_REPO ✓"
fi

# ── 第3步：创建工作目录 ──
log "步骤 3/4：创建工作目录..."

if [ -d "$WORK_DIR/.git" ]; then
    warn "工作目录已存在: $WORK_DIR，跳过"
else
    mkdir -p "$WORK_DIR"
    git clone "$BARE_REPO" "$WORK_DIR" 2>/dev/null || {
        # 如果 bare repo 是空的，手动初始化
        cd "$WORK_DIR"
        git init
        git remote add origin "$BARE_REPO" 2>/dev/null || git remote set-url origin "$BARE_REPO"
    }
    log "工作目录创建完成: $WORK_DIR ✓"
fi

# ── 第4步：安装 post-receive 钩子 ──
log "步骤 4/4：安装 post-receive 部署钩子..."

cat > "$BARE_REPO/hooks/post-receive" << 'HOOK_EOF'
#!/usr/bin/env bash
# ============================================================
# GovAI post-receive 钩子 — 收到 push 后自动部署
# ============================================================
set -euo pipefail

# 必须 unset，否则 bare repo 的 GIT_DIR 会干扰工作目录的 git 操作
unset GIT_DIR

WORK_DIR="$HOME/GovAI"
COMPOSE_FILE="$WORK_DIR/docker-compose.prod.yml"
ENV_FILE="$WORK_DIR/.env.production"
LOG_FILE="$WORK_DIR/deploy/deploy.log"

# 确保日志目录存在（必须在 log 函数之前）
mkdir -p "$WORK_DIR/deploy"

log() { echo "[DEPLOY $(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# 只处理 main 分支的推送
while read oldrev newrev refname; do
    BRANCH=$(echo "$refname" | sed 's|refs/heads/||')
    if [ "$BRANCH" != "main" ]; then
        echo "收到 $BRANCH 分支推送，跳过部署（仅 main 分支触发）"
        continue
    fi

    log "========================================="
    log "收到 main 分支推送，开始自动部署..."
    log "提交: $(echo $newrev | cut -c1-8)"
    log "========================================="

    # 1. 更新工作目录
    log "[1/5] 更新代码..."
    cd "$WORK_DIR"

    # 首次推送时工作目录可能为空，需要初始化
    if [ ! -d "$WORK_DIR/.git" ]; then
        git clone "$HOME/GovAI.git" "$WORK_DIR" 2>&1 | tee -a "$LOG_FILE"
    fi

    git fetch origin main 2>&1 | tee -a "$LOG_FILE"
    git reset --hard origin/main 2>&1 | tee -a "$LOG_FILE"
    log "代码更新完成 ✓"

    # 2. 检查环境文件
    if [ ! -f "$ENV_FILE" ]; then
        log "❌ .env.production 不存在！请先配置"
        log "   cp $WORK_DIR/.env.production.example $ENV_FILE"
        exit 1
    fi

    # 3. 构建 Docker 镜像
    log "[2/5] 构建 Docker 镜像..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build 2>&1 | tee -a "$LOG_FILE"
    log "镜像构建完成 ✓"

    # 4. 数据库迁移
    log "[3/5] 数据库迁移..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres redis 2>&1 | tee -a "$LOG_FILE"
    sleep 10
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm \
        backend alembic upgrade head 2>&1 | tee -a "$LOG_FILE" || {
        log "[WARN] 迁移跳过（可能是首次部署）"
    }
    log "数据库迁移完成"

    # 5. 启动/重启所有服务
    log "[4/5] 启动服务..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --remove-orphans 2>&1 | tee -a "$LOG_FILE"
    log "服务启动完成"

    # 6. 清理
    log "[5/5] 清理旧镜像..."
    docker image prune -f 2>&1 | tee -a "$LOG_FILE"

    # 7. 状态
    log ""
    log "=== 部署完成! ==="
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps 2>&1 | tee -a "$LOG_FILE"
    log "访问地址: http://$(grep SERVER_IP "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo '10.16.49.100')"
    log "========================================="
done
HOOK_EOF

chmod +x "$BARE_REPO/hooks/post-receive"
log "post-receive 钩子安装完成 ✓"

# ── 完成 ──
echo ""
log "═══════════════════════════════════════════════════════"
log "  服务器初始化完成！"
log ""
log "  裸仓库: $BARE_REPO"
log "  工作目录: $WORK_DIR"
log ""
log "  ▶ 接下来请在服务器上配置环境变量："
log "    cp $WORK_DIR/.env.production.example $WORK_DIR/.env.production"
log "    nano $WORK_DIR/.env.production"
log ""
log "  ▶ 然后在本地电脑（Windows）上添加远程仓库："
log "    git remote add deploy ssh://wy@10.16.49.100:8989/home/wy/GovAI.git"
log ""
log "  ▶ 首次推送："
log "    git push deploy main"
log ""
log "  之后每次 git push deploy main 即可自动部署！"
log "═══════════════════════════════════════════════════════"
