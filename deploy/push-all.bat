@echo off
chcp 65001 >nul 2>&1
REM ============================================================
REM GovAI 一键部署脚本（Windows 本地执行）
REM 同时推送代码到 GitHub、内网服务器、公网服务器
REM ============================================================

setlocal enabledelayedexpansion

echo.
echo ══════════════════════════════════════
echo   GovAI 一键推送部署
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
        echo.
    )
)

REM ── 检查是否有未推送的提交 ──
echo [信息] 当前分支: main
echo.

set SUCCESS_COUNT=0
set FAIL_COUNT=0

REM ── [1/3] 推送到 GitHub ──
echo [1/3] 推送到 GitHub (origin)...
git push origin main
if %errorlevel%==0 (
    echo       √ GitHub 推送成功
    set /a SUCCESS_COUNT+=1
) else (
    echo       × GitHub 推送失败（不影响服务器部署）
    set /a FAIL_COUNT+=1
)
echo.

REM ── [2/3] 推送到内网服务器 ──
echo [2/3] 推送到内网服务器 (10.16.49.100)...
git push deploy main
if %errorlevel%==0 (
    echo       √ 内网服务器推送成功（自动部署中...）
    set /a SUCCESS_COUNT+=1
) else (
    echo       × 内网服务器推送失败
    set /a FAIL_COUNT+=1
)
echo.

REM ── [3/3] 推送到公网服务器 ──
echo [3/3] 推送到公网服务器 (38.55.129.237)...
git push public main
if %errorlevel%==0 (
    echo       √ 公网服务器推送成功（自动部署中...）
    set /a SUCCESS_COUNT+=1
) else (
    echo       × 公网服务器推送失败
    set /a FAIL_COUNT+=1
)
echo.

REM ── 汇总 ──
echo ══════════════════════════════════════
echo   推送完成: %SUCCESS_COUNT% 成功, %FAIL_COUNT% 失败
echo.
echo   GitHub:   https://github.com/jianghao-jianghao-jianghao/GovAI
echo   内网:     http://10.16.49.100
echo   公网:     http://38.55.129.237
echo ══════════════════════════════════════
echo.

endlocal
pause
