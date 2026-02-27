@echo off
REM ============================================================
REM GovAI 一键部署脚本（Windows 本地执行）
REM 同时推送到 GitHub 和内网服务器
REM ============================================================

echo ==============================
echo   GovAI Deploy
echo ==============================
echo.

REM 推送到 GitHub（备份）
echo [1/2] 推送到 GitHub...
git push origin main 2>nul
if %errorlevel%==0 (
    echo √ GitHub 推送成功
) else (
    echo ! GitHub 推送失败（可忽略，不影响部署）
)

echo.

REM 推送到内网服务器（通过 WSL + sshpass，触发自动部署）
echo [2/2] 推送到内网服务器（自动部署）...
wsl -- bash -c "cd /mnt/d/apache-maven-3.9.1/GovAI ; GIT_SSH_COMMAND='sshpass -p wy62487732 ssh -p 8989 -o StrictHostKeyChecking=no' git push deploy main 2>&1"
if %errorlevel%==0 (
    echo.
    echo ==============================
    echo   部署完成！
    echo   访问: http://10.16.49.100
    echo ==============================
) else (
    echo.
    echo × 部署失败，请检查 WSL 和 SSH 连接
)

pause
