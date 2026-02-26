@echo off
echo ========================================
echo  GovAI 系统一键重启脚本
echo ========================================
echo.

echo [1/3] 停止所有服务...
docker-compose down

echo.
echo [2/3] 启动核心服务...
docker-compose up -d

echo.
echo [3/3] 检查服务状态...
timeout /t 3 >nul
docker-compose ps

echo.
echo ========================================
echo  重启完成！
echo ========================================
echo  前端: http://localhost:3000
echo  后端: http://localhost:8000/docs
echo  数据库管理: http://localhost:5050
echo ========================================
pause
