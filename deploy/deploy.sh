#!/usr/bin/env bash
# ============================================================
# GovAI 部署脚本 — Volume 挂载架构
#
# 架构说明：
#   - 后端代码通过 volume 挂载，无需重建镜像
#   - 前端通过 frontend-builder 服务在服务器端构建，输出到 dist/
#   - 仅当 Python/系统依赖变更时才需要 build-deps
#
# 也可以手动执行: bash deploy/deploy.sh
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.prod.yml"
ENV_FILE="$PROJECT_DIR/.env.production"
LOG_FILE="$PROJECT_DIR/deploy/deploy.log"
COMPOSE_CMD="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

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

# ── 构建前端（服务器端） ──
build_frontend() {
    log "构建前端（服务器端 frontend-builder）..."
    cd "$PROJECT_DIR"
    $COMPOSE_CMD --profile build run --rm frontend-builder
    if [ -d "$PROJECT_DIR/dist" ] && [ -f "$PROJECT_DIR/dist/index.html" ]; then
        log "前端构建完成 ✓  (dist/ 就绪)"
    else
        err "前端构建失败：dist/index.html 不存在"
        exit 1
    fi
}

# ── 构建基础镜像（仅依赖变更时使用） ──
build_deps() {
    log "重建基础镜像（安装依赖）..."
    cd "$PROJECT_DIR"
    # 后端：重建 Python 基础镜像（包含 pip 包、系统依赖、字体）
    $COMPOSE_CMD build backend
    # converter：同理
    $COMPOSE_CMD build converter
    log "基础镜像重建完成 ✓"
}

# ── 数据库迁移 ──
run_migrations() {
    log "运行数据库迁移..."
    cd "$PROJECT_DIR"

    # 确保 postgres 已启动
    $COMPOSE_CMD up -d postgres redis
    log "等待数据库就绪..."
    sleep 10

    # 使用 run --rm 而非 exec，确保容器无论是否运行都能执行迁移
    $COMPOSE_CMD run --rm backend alembic upgrade head || {
        warn "数据库迁移失败（可能是首次部署，schema.sql 已初始化）"
    }

    log "数据库迁移完成 ✓"
}

# ── 部署服务 ──
deploy_services() {
    log "启动所有服务..."
    cd "$PROJECT_DIR"
    $COMPOSE_CMD up -d --remove-orphans
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
    err "回滚到上一版本..."
    cd "$PROJECT_DIR"

    # volume 挂载架构：回滚 = 回退代码 + 重新构建前端 + 重启
    local prev_commit
    prev_commit=$(git rev-parse HEAD~1 2>/dev/null || echo "")
    if [ -z "$prev_commit" ]; then
        err "没有可用的上一版本"
        exit 1
    fi

    log "回退到提交: $(echo $prev_commit | cut -c1-8)"
    git reset --hard "$prev_commit"

    # 重新构建前端（服务器端）
    build_frontend

    # 重启服务（代码已通过 volume 回退）
    $COMPOSE_CMD restart backend frontend

    log "回滚完成 ✓"
    status
}

# ── 状态查看 ──
status() {
    echo ""
    log "═══ 服务状态 ═══"
    $COMPOSE_CMD ps
    echo ""
    log "═══ 资源使用 ═══"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" \
        govai-frontend govai-backend govai-postgres govai-redis govai-converter 2>/dev/null || true
}

# ── 查看日志 ──
logs() {
    local service="${1:-}"
    cd "$PROJECT_DIR"
    if [ -n "$service" ]; then
        $COMPOSE_CMD logs -f "$service"
    else
        $COMPOSE_CMD logs -f --tail=100
    fi
}

# ── 主流程 ──
main() {
    local action="${1:-deploy}"

    mkdir -p "$PROJECT_DIR/deploy"

    case "$action" in
        deploy)
            # 标准部署：构建前端 + 迁移 + 启动（不重建镜像）
            log "═══ 开始部署 GovAI ═══"
            check_prerequisites
            build_frontend
            run_migrations
            deploy_services
            health_check
            cleanup
            status
            log "═══ 部署完成！═══"
            log "访问地址: http://$(grep SERVER_IP "$ENV_FILE" | cut -d= -f2 || echo '10.16.49.100'):$(grep FRONTEND_PORT "$ENV_FILE" | cut -d= -f2 || echo '80')"
            ;;
        quick)
            # 快速部署：仅重启后端（后端代码已通过 volume 挂载更新）
            log "═══ 快速部署（仅后端） ═══"
            check_prerequisites
            cd "$PROJECT_DIR"
            $COMPOSE_CMD restart backend
            health_check
            status
            log "═══ 快速部署完成！═══"
            ;;
        build-deps)
            # 依赖变更时重建基础镜像（requirements.txt / 系统包 / Dockerfile 变更）
            log "═══ 重建基础镜像 ═══"
            check_prerequisites
            build_deps
            deploy_services
            health_check
            status
            log "═══ 基础镜像重建完成！═══"
            ;;
        build-frontend)
            # 仅构建前端（服务器端）
            log "═══ 构建前端 ═══"
            check_prerequisites
            build_frontend
            cd "$PROJECT_DIR"
            $COMPOSE_CMD restart frontend
            log "═══ 前端构建完成！═══"
            ;;
        stop)
            log "停止所有服务..."
            cd "$PROJECT_DIR"
            $COMPOSE_CMD down
            log "所有服务已停止"
            ;;
        restart)
            log "重启所有服务..."
            cd "$PROJECT_DIR"
            $COMPOSE_CMD restart
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
            echo "用法: $0 {deploy|quick|build-deps|build-frontend|stop|restart|status|logs [service]|rollback}"
            echo ""
            echo "  deploy          - 标准部署（服务器端构建前端 + 迁移 + 启动，不重建镜像）"
            echo "  quick           - 快速部署（仅重启后端，代码已通过 volume 更新）"
            echo "  build-deps      - 重建基础镜像（requirements.txt / Dockerfile 变更时使用）"
            echo "  build-frontend  - 仅在服务器端构建前端并重启 nginx"
            echo "  stop            - 停止所有服务"
            echo "  restart         - 重启所有服务"
            echo "  status          - 查看服务状态"
            echo "  logs            - 查看日志 (可指定服务名)"
            echo "  rollback        - 回滚到上一版本"
            exit 1
            ;;
    esac
}

main "$@"
