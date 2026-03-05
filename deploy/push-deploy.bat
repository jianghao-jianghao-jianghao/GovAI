@echo off
chcp 65001 >nul 2>&1
REM ============================================================
REM GovAI 快速部署脚本（Windows 本地执行）
REM 推送到 GitHub + 内网服务器（自动触发 post-receive 部署）
REM ============================================================

setlocal enabledelayedexpansion

echo.
echo ══════════════════════════════════════
echo   GovAI 快速部署
echo ══════════════════════════════════════
echo.

REM ── 检查是否有未提交的更改 ──
git diff --quiet 2>nul
if %errorlevel% neq 0 (
    echo [提示] 检测到未提交的更改:
    git status --short
    echo.
    set /p MSG="请输入 commit 信息 (直接回车跳过提交): "
    if not "!MSG!"=="" (
        git add -A
        git commit -m "!MSG!"
        echo       √ 已提交
        echo.
    )
)

REM ── [1/2] 推送到 GitHub（备份） ──
echo [1/2] 推送到 GitHub (origin)...
git push origin main 2>nul
if %errorlevel%==0 (
    echo       √ GitHub 推送成功
) else (
    echo       ! GitHub 推送失败（可忽略，不影响部署）
)
echo.

REM ── [2/2] 推送到内网服务器（触发自动部署） ──
echo [2/2] 推送到内网服务器 (10.16.49.100)...
git push deploy main
if %errorlevel%==0 (
    echo.
    echo ══════════════════════════════════════
    echo   √ 部署完成！
    echo   post-receive 钩子将自动:
    echo     - 更新代码
    echo     - 构建前端 (如有变更)
    echo     - 运行数据库迁移 (如有变更)
    echo     - 重启服务
    echo   访问: http://10.16.49.100
    echo ══════════════════════════════════════
) else (
    echo.
    echo × 服务器推送失败，请检查 SSH 连接
    echo   确认已配置: git remote add deploy ssh://wy@10.16.49.100:8989/home/wy/GovAI.git
)

endlocal
pause
