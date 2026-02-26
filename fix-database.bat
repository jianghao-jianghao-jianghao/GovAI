@echo off
echo ========================================
echo  修复数据库枚举类型
echo ========================================
echo.

echo [1/2] 执行修复脚本...
docker exec -i govai-postgres psql -U govai_user -d govai_db < fix-enum-types.sql

echo.
echo [2/2] 重启后端服务...
docker restart govai-backend

echo.
echo ========================================
echo  修复完成！
echo ========================================
echo  请刷新前端页面重试
echo ========================================
pause
