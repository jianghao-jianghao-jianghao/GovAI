@echo off
chcp 65001 >nul 2>&1
echo ========================================
echo  GovAI 系统一键重启脚本（本地开发）
echo ========================================
echo.

echo [1/3] 停止所有服务...
docker compose down

echo.
echo [2/3] 启动核心服务...
docker compose up -d

echo.
echo [3/3] 检查服务状态...
timeout /t 5 >nul
docker compose ps

echo.
echo ========================================
echo  重启完成！
echo ========================================
echo  前端: http://localhost
echo  后端: http://localhost:8000/docs
echo ========================================
pause
