@echo off
chcp 65001 >nul 2>&1
REM ============================================================
REM GovAI 代码更新部署脚本（Windows 本地执行）
REM
REM Volume 挂载架构 — 更新流程：
REM   1. 本地构建前端 (pnpm build → dist/)
REM   2. 提交代码到 Git
REM   3. 推送到服务器（post-receive 钩子自动更新代码 + 重启后端）
REM   4. SCP 上传前端构建产物 dist/ 到服务器
REM   5. 重启 nginx 加载新前端
REM
REM 用法:
REM   deploy\update.bat              — 完整更新（前端+后端）
REM   deploy\update.bat backend      — 仅后端（跳过前端构建）
REM   deploy\update.bat frontend     — 仅前端（跳过 git push）
REM   deploy\update.bat migrate      — 运行数据库迁移
REM   deploy\update.bat status       — 查看服务器状态
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
if "%MODE%"=="migrate" goto :MIGRATE
if "%MODE%"=="backend" goto :BACKEND_ONLY
if "%MODE%"=="frontend" goto :FRONTEND_ONLY
if "%MODE%"=="full" goto :FULL
goto :USAGE

REM ════════════════════════════════════════════════
REM  完整更新：前端构建 + 提交 + 推送 + 上传 dist
REM ════════════════════════════════════════════════
:FULL
echo [1/5] 构建前端...
call :BUILD_FRONTEND
if %errorlevel% neq 0 (
    echo.
    echo × 前端构建失败，中止部署
    goto :END
)

echo.
echo [2/5] 提交代码...
call :GIT_COMMIT

echo.
echo [3/5] 推送到服务器（后端代码通过 volume 自动更新）...
call :GIT_PUSH

echo.
echo [4/5] 上传前端构建产物到服务器...
call :UPLOAD_DIST

echo.
echo [5/5] 重启服务...
call :RESTART_ALL

goto :DONE

REM ════════════════════════════════════════════════
REM  仅后端：提交 + 推送（volume 挂载，重启即生效）
REM ════════════════════════════════════════════════
:BACKEND_ONLY
echo [1/3] 提交代码...
call :GIT_COMMIT

echo.
echo [2/3] 推送到服务器...
call :GIT_PUSH

echo.
echo [3/3] 重启后端容器...
ssh -p %SSH_PORT% %SSH_USER%@%SERVER% "cd ~/GovAI && docker compose -f docker-compose.prod.yml --env-file .env.production restart backend"
echo       √ 后端已重启

goto :DONE

REM ════════════════════════════════════════════════
REM  仅前端：构建 + 上传 + 重启 nginx
REM ════════════════════════════════════════════════
:FRONTEND_ONLY
echo [1/3] 构建前端...
call :BUILD_FRONTEND
if %errorlevel% neq 0 (
    echo × 前端构建失败
    goto :END
)

echo.
echo [2/3] 上传前端到服务器...
call :UPLOAD_DIST

echo.
echo [3/3] 重启 nginx...
ssh -p %SSH_PORT% %SSH_USER%@%SERVER% "docker restart govai-frontend"
echo       √ 前端已重启

goto :DONE

REM ════════════════════════════════════════════════
REM  数据库迁移
REM ════════════════════════════════════════════════
:MIGRATE
echo 运行数据库迁移...
ssh -p %SSH_PORT% %SSH_USER%@%SERVER% "cd ~/GovAI && %COMPOSE_CMD% exec backend alembic upgrade head"
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
REM  子函数
REM ════════════════════════════════════════════════

:BUILD_FRONTEND
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo       安装 pnpm...
    call npm install -g pnpm >nul 2>&1
)
call pnpm install --frozen-lockfile >nul 2>&1
call pnpm run build
if exist "dist\index.html" (
    echo       √ 前端构建成功 (dist/)
    exit /b 0
) else (
    echo       × dist/index.html 不存在
    exit /b 1
)

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
    echo       √ 服务器代码已更新（volume 挂载，后端代码即时生效）
) else (
    echo       × 服务器推送失败
    exit /b 1
)
exit /b 0

:UPLOAD_DIST
if not exist "dist\index.html" (
    echo       × dist/ 不存在，请先执行前端构建
    exit /b 1
)
scp -r -P %SSH_PORT% dist %SSH_USER%@%SERVER%:~/GovAI/
if %errorlevel%==0 (
    echo       √ 前端产物已上传
) else (
    echo       × 上传失败
    exit /b 1
)
exit /b 0

:RESTART_ALL
ssh -p %SSH_PORT% %SSH_USER%@%SERVER% "cd ~/GovAI && %COMPOSE_CMD% restart backend && docker restart govai-frontend && echo 'OK'"
if %errorlevel%==0 (
    echo       √ 所有服务已重启
) else (
    echo       × 重启失败
)
exit /b 0

REM ════════════════════════════════════════════════

:USAGE
echo.
echo 用法: deploy\update.bat [模式]
echo.
echo 模式:
echo   (空)       完整更新: 构建前端 + 提交 + 推送 + 上传 + 重启
echo   backend    仅后端:   提交 + 推送 + 重启后端 (代码通过 volume 更新)
echo   frontend   仅前端:   构建 + 上传 dist/ + 重启 nginx
echo   migrate    数据库迁移: 在后端容器内执行 alembic upgrade head
echo   status     查看服务器上所有容器状态
echo.
echo 架构说明:
echo   后端: 代码通过 volume 挂载到容器，push 后重启即生效
echo   前端: 本地 pnpm build 生成 dist/，SCP 上传，nginx 挂载
echo   依赖变更: 需要登录服务器手动 docker compose build backend
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
