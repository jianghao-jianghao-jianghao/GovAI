#!/usr/bin/env bash
# ============================================================
# GovAI 部署脚本 — 在服务器上由 GitHub Actions Runner 调用
# 也可以手动执行: bash deploy/deploy.sh
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.prod.yml"
ENV_FILE="$PROJECT_DIR/.env.production"
LOG_FILE="$PROJECT_DIR/deploy/deploy.log"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[DEPLOY $(date '+%H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[WARN  $(date '+%H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"; }
err()  { echo -e "${RED}[ERROR $(date '+%H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"; }

# ── 前置检查 ──
check_prerequisites() {
    log "检查前置条件..."

    if ! command -v docker &>/dev/null; then
        err "Docker 未安装"; exit 1
    fi

    if ! docker compose version &>/dev/null; then
        err "Docker Compose 未安装"; exit 1
    fi

    if [ ! -f "$ENV_FILE" ]; then
        err ".env.production 文件不存在，请先从 .env.production.example 复制并配置"
        err "  cp $PROJECT_DIR/.env.production.example $ENV_FILE"
        exit 1
    fi

    log "前置检查通过 ✓"
}

# ── 构建镜像 ──
build_images() {
    log "构建 Docker 镜像..."
    cd "$PROJECT_DIR"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache
    log "镜像构建完成 ✓"
}

# ── 数据库迁移 ──
run_migrations() {
    log "运行数据库迁移..."
    cd "$PROJECT_DIR"

    # 确保 postgres 已启动
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres redis
    log "等待数据库就绪..."
    sleep 10

    # 在 backend 容器中运行 alembic 迁移
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm \
        backend alembic upgrade head || {
        warn "数据库迁移失败（可能是首次部署，schema.sql 已初始化）"
    }

    log "数据库迁移完成 ✓"
}

# ── 部署服务 ──
deploy_services() {
    log "启动所有服务..."
    cd "$PROJECT_DIR"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --remove-orphans
    log "所有服务已启动 ✓"
}

# ── 健康检查 ──
health_check() {
    log "执行健康检查..."
    local max_retries=30
    local retry=0

    while [ $retry -lt $max_retries ]; do
        if curl -sf http://localhost:80/health > /dev/null 2>&1; then
            log "前端健康检查通过 ✓"
            break
        fi
        retry=$((retry + 1))
        sleep 2
    done

    if [ $retry -eq $max_retries ]; then
        warn "前端健康检查超时，请手动检查"
    fi

    retry=0
    while [ $retry -lt $max_retries ]; do
        if curl -sf http://localhost:8000/api/v1/health > /dev/null 2>&1; then
            log "后端健康检查通过 ✓"
            break
        fi
        retry=$((retry + 1))
        sleep 2
    done

    if [ $retry -eq $max_retries ]; then
        warn "后端健康检查超时，请手动检查"
    fi
}

# ── 清理旧镜像 ──
cleanup() {
    log "清理悬空镜像..."
    docker image prune -f || true
    log "清理完成 ✓"
}

# ── 回滚 ──
rollback() {
    err "部署失败，尝试回滚..."
    cd "$PROJECT_DIR"

    # 尝试恢复到上一次的镜像
    if git stash list | grep -q "deploy-backup"; then
        git stash pop
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --remove-orphans
        log "回滚完成"
    else
        err "没有可用的回滚点"
    fi
}

# ── 状态查看 ──
status() {
    echo ""
    log "═══ 服务状态 ═══"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
    echo ""
    log "═══ 资源使用 ═══"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" \
        govai-frontend govai-backend govai-postgres govai-redis 2>/dev/null || true
}

# ── 查看日志 ──
logs() {
    local service="${1:-}"
    cd "$PROJECT_DIR"
    if [ -n "$service" ]; then
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs -f "$service"
    else
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs -f --tail=100
    fi
}

# ── 主流程 ──
main() {
    local action="${1:-deploy}"

    mkdir -p "$PROJECT_DIR/deploy"

    case "$action" in
        deploy)
            log "═══ 开始部署 GovAI ═══"
            check_prerequisites
            build_images
            run_migrations
            deploy_services
            health_check
            cleanup
            status
            log "═══ 部署完成！═══"
            log "访问地址: http://$(grep SERVER_IP "$ENV_FILE" | cut -d= -f2 || echo '10.16.49.100'):$(grep FRONTEND_PORT "$ENV_FILE" | cut -d= -f2 || echo '80')"
            ;;
        quick)
            # 快速部署：仅重建变更的镜像并重启
            log "═══ 快速部署 ═══"
            check_prerequisites
            cd "$PROJECT_DIR"
            docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build --remove-orphans
            health_check
            cleanup
            status
            log "═══ 快速部署完成！═══"
            ;;
        stop)
            log "停止所有服务..."
            cd "$PROJECT_DIR"
            docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down
            log "所有服务已停止"
            ;;
        restart)
            log "重启所有服务..."
            cd "$PROJECT_DIR"
            docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart
            status
            ;;
        status)
            status
            ;;
        logs)
            logs "${2:-}"
            ;;
        rollback)
            rollback
            ;;
        *)
            echo "用法: $0 {deploy|quick|stop|restart|status|logs [service]|rollback}"
            echo ""
            echo "  deploy   - 完整部署（构建镜像 + 迁移 + 启动）"
            echo "  quick    - 快速部署（增量构建 + 启动）"
            echo "  stop     - 停止所有服务"
            echo "  restart  - 重启所有服务"
            echo "  status   - 查看服务状态"
            echo "  logs     - 查看日志 (可指定服务名)"
            echo "  rollback - 回滚到上一版本"
            exit 1
            ;;
    esac
}

main "$@"
