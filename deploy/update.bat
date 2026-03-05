@echo off
chcp 65001 >nul 2>&1
REM ============================================================
REM GovAI 代码更新部署脚本（Windows 本地执行）
REM
REM Volume 挂载架构 — 所有构建均在服务器端完成：
REM   1. 提交代码到 Git
REM   2. 推送到服务器（post-receive 钩子自动：更新代码 → 构建前端 → 迁移 → 重启）
REM
REM   无需本地安装 pnpm，无需 SCP 上传！
REM
REM 用法:
REM   deploy\update.bat              — 完整更新（提交 + 推送，服务器自动构建部署）
REM   deploy\update.bat backend      — 仅后端（提交 + 推送 + 重启后端）
REM   deploy\update.bat frontend     — 仅前端（SSH 触发服务器端构建 + 重启 nginx）
REM   deploy\update.bat build-deps   — 重建基础镜像（requirements.txt / Dockerfile 变更时）
REM   deploy\update.bat migrate      — 运行数据库迁移
REM   deploy\update.bat status       — 查看服务器状态
REM   deploy\update.bat logs [svc]   — 查看服务器日志
REM ============================================================

setlocal enabledelayedexpansion

set SERVER=10.16.49.100
set SSH_PORT=8989
set SSH_USER=wy
set PROJECT_DIR=%~dp0..
set COMPOSE_CMD=docker compose -f docker-compose.prod.yml --env-file .env.production

REM ── 切换到项目根目录 ──
pushd "%PROJECT_DIR%"

REM ── 解析参数 ──
set MODE=%~1
if "%MODE%"=="" set MODE=full

echo.
echo ══════════════════════════════════════════════
echo   GovAI 部署更新 [%MODE%]
echo ══════════════════════════════════════════════
echo.

if "%MODE%"=="status" goto :STATUS
if "%MODE%"=="logs" goto :LOGS
if "%MODE%"=="migrate" goto :MIGRATE
if "%MODE%"=="backend" goto :BACKEND_ONLY
if "%MODE%"=="frontend" goto :FRONTEND_ONLY
if "%MODE%"=="build-deps" goto :BUILD_DEPS
if "%MODE%"=="full" goto :FULL
goto :USAGE

REM ════════════════════════════════════════════════
REM  完整更新：提交 + 推送（post-receive 自动构建部署）
REM ════════════════════════════════════════════════
:FULL
echo [1/2] 提交代码...
call :GIT_COMMIT

echo.
echo [2/2] 推送到服务器（自动触发：更新代码 → 构建前端 → 迁移 → 重启）...
call :GIT_PUSH

goto :DONE

REM ════════════════════════════════════════════════
REM  仅后端：提交 + 推送 + 重启（volume 挂载，重启即生效）
REM ════════════════════════════════════════════════
:BACKEND_ONLY
echo [1/3] 提交代码...
call :GIT_COMMIT

echo.
echo [2/3] 推送到服务器...
call :GIT_PUSH

echo.
echo [3/3] 重启后端容器...
ssh -p %SSH_PORT% %SSH_USER%@%SERVER% "cd ~/GovAI && %COMPOSE_CMD% restart backend && echo OK"
echo       √ 后端已重启

goto :DONE

REM ════════════════════════════════════════════════
REM  仅前端：SSH 触发服务器端构建 + 重启 nginx
REM ════════════════════════════════════════════════
:FRONTEND_ONLY
echo [1/3] 提交代码...
call :GIT_COMMIT

echo.
echo [2/3] 推送代码并在服务器端构建前端...
call :GIT_PUSH
call :SERVER_BUILD_FRONTEND

echo.
echo [3/3] 重启 nginx...
ssh -p %SSH_PORT% %SSH_USER%@%SERVER% "docker restart govai-frontend && echo OK"
echo       √ 前端已重启

goto :DONE

REM ════════════════════════════════════════════════
REM  重建基础镜像（依赖变更时使用）
REM ════════════════════════════════════════════════
:BUILD_DEPS
echo [1/3] 提交代码...
call :GIT_COMMIT

echo.
echo [2/3] 推送到服务器...
call :GIT_PUSH

echo.
echo [3/3] 在服务器端重建基础镜像...
ssh -p %SSH_PORT% %SSH_USER%@%SERVER% "cd ~/GovAI && %COMPOSE_CMD% build backend converter && %COMPOSE_CMD% up -d --remove-orphans && %COMPOSE_CMD% restart backend && echo OK"
if %errorlevel%==0 (
    echo       √ 基础镜像重建完成，服务已重启
) else (
    echo       × 镜像重建失败
)
goto :DONE

REM ════════════════════════════════════════════════
REM  数据库迁移
REM ════════════════════════════════════════════════
:MIGRATE
echo 运行数据库迁移...
ssh -p %SSH_PORT% %SSH_USER%@%SERVER% "cd ~/GovAI && %COMPOSE_CMD% run --rm backend alembic upgrade head"
if %errorlevel%==0 (
    echo       √ 迁移完成
) else (
    echo       × 迁移失败
)
goto :END

REM ════════════════════════════════════════════════
REM  查看状态
REM ════════════════════════════════════════════════
:STATUS
echo 查询服务器状态...
echo.
ssh -p %SSH_PORT% %SSH_USER%@%SERVER% "cd ~/GovAI && %COMPOSE_CMD% ps && echo. && docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' govai-backend govai-frontend govai-postgres govai-redis govai-converter 2>/dev/null"
goto :END

REM ════════════════════════════════════════════════
REM  查看日志
REM ════════════════════════════════════════════════
:LOGS
set SVC=%~2
if "%SVC%"=="" (
    ssh -p %SSH_PORT% %SSH_USER%@%SERVER% "cd ~/GovAI && %COMPOSE_CMD% logs --tail=100"
) else (
    ssh -p %SSH_PORT% %SSH_USER%@%SERVER% "cd ~/GovAI && %COMPOSE_CMD% logs --tail=100 %SVC%"
)
goto :END

REM ════════════════════════════════════════════════
REM  子函数
REM ════════════════════════════════════════════════

:GIT_COMMIT
git diff --quiet 2>nul
if %errorlevel% neq 0 (
    echo       检测到未提交的更改:
    git status --short
    echo.
    set /p COMMIT_MSG="       输入 commit 信息 (回车跳过): "
    if not "!COMMIT_MSG!"=="" (
        git add -A
        git commit -m "!COMMIT_MSG!"
        echo       √ 已提交
    ) else (
        echo       - 跳过提交
    )
) else (
    REM 检查是否有待推送的提交
    for /f %%i in ('git rev-list --count deploy/main..HEAD 2^>nul') do (
        if %%i gtr 0 (
            echo       有 %%i 个待推送的提交
        ) else (
            echo       无更改需要提交
        )
    )
)
exit /b 0

:GIT_PUSH
REM 推送到 GitHub（备份）
git push origin main >nul 2>&1
if %errorlevel%==0 (
    echo       √ GitHub 同步完成
) else (
    echo       - GitHub 推送跳过
)

REM 推送到内网服务器（触发 post-receive 自动部署）
git push deploy main
if %errorlevel%==0 (
    echo       √ 服务器推送完成（post-receive 自动部署中...）
) else (
    echo       × 服务器推送失败
    exit /b 1
)
exit /b 0

:SERVER_BUILD_FRONTEND
echo       在服务器端构建前端...
ssh -p %SSH_PORT% %SSH_USER%@%SERVER% "cd ~/GovAI && %COMPOSE_CMD% --profile build run --rm frontend-builder"
if %errorlevel%==0 (
    echo       √ 服务器端前端构建完成
) else (
    echo       × 服务器端前端构建失败
    exit /b 1
)
exit /b 0

REM ════════════════════════════════════════════════

:USAGE
echo.
echo 用法: deploy\update.bat [模式]
echo.
echo 模式:
echo   (空)         完整更新: 提交 + 推送 (post-receive 自动构建前端 + 迁移 + 重启)
echo   backend      仅后端:   提交 + 推送 + 重启后端 (代码通过 volume 更新)
echo   frontend     仅前端:   提交 + 推送 + 服务器端构建前端 + 重启 nginx
echo   build-deps   重建镜像: 提交 + 推送 + 重建 backend/converter 基础镜像
echo   migrate      数据库迁移: 在服务器端执行 alembic upgrade head
echo   status       查看服务器上所有容器状态
echo   logs [svc]   查看服务器日志 (可选指定服务名: backend/frontend/postgres)
echo.
echo 架构说明:
echo   后端: 代码通过 volume 挂载到容器，push 后重启即生效，无需重建镜像
echo   前端: 服务器端 frontend-builder 容器构建，nginx 通过 volume 挂载 dist/
echo   依赖变更: 使用 build-deps 模式重建基础镜像 (requirements.txt / Dockerfile)
echo   全自动: git push 触发 post-receive 钩子，智能检测变更并自动构建部署
echo.
goto :END

:DONE
echo.
echo ══════════════════════════════════════════════
echo   √ 部署完成！
echo   访问: http://%SERVER%
echo ══════════════════════════════════════════════
echo.

:END
popd
endlocal
pause
