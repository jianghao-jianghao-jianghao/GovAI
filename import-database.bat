@echo off
echo ========================================
echo  导入同事的数据库
echo ========================================
echo.
echo 警告：此操作将覆盖当前数据库！
echo.
pause

echo.
echo [1/4] 停止后端服务...
docker stop govai-backend

echo.
echo [2/4] 删除旧数据库...
docker exec govai-postgres psql -U govai_user -d postgres -c "DROP DATABASE IF EXISTS govai_db;"

echo.
echo [3/4] 创建新数据库...
docker exec govai-postgres psql -U govai_user -d postgres -c "CREATE DATABASE govai_db OWNER govai_user;"

echo.
echo [4/4] 导入数据...
docker exec -i govai-postgres psql -U govai_user -d govai_db < govai_db_dump.sql

echo.
echo [5/5] 重启后端服务...
docker start govai-backend

echo.
echo ========================================
echo  导入完成！
echo ========================================
pause
