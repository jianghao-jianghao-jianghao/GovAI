#!/bin/bash

# ============================================
# Dify 集成部署脚本
# ============================================

set -e  # 遇到错误立即退出

echo "=========================================="
echo "Dify 集成部署脚本"
echo "=========================================="

# 检查 Python 版本
echo "检查 Python 版本..."
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "Python 版本: $python_version"

# 检查是否存在虚拟环境
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
echo "激活虚拟环境..."
source venv/bin/activate

# 安装依赖
echo "安装依赖..."
pip install --upgrade pip
pip install -r requirements.txt

# 检查环境变量
if [ ! -f ".env" ]; then
    echo "警告：未找到 .env 文件"
    echo "请复制 .env.example 为 .env 并填入实际配置"
    cp .env.example .env
    echo "已创建 .env 文件，请编辑后重新运行"
    exit 1
fi

# 加载环境变量
echo "加载环境变量..."
export $(cat .env | grep -v '^#' | xargs)

# 验证必需的环境变量
required_vars=(
    "DIFY_API_BASE_URL"
    "DIFY_DATASET_API_KEY"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "错误：环境变量 $var 未设置"
        exit 1
    fi
done

echo "环境变量验证通过"

# 运行测试（可选）
if [ "$1" == "--test" ]; then
    echo "运行测试..."
    pip install -r tests/requirements-test.txt
    pytest tests/ -v --cov=services/dify --cov-report=html
    echo "测试完成，覆盖率报告：htmlcov/index.html"
fi

echo "=========================================="
echo "部署完成！"
echo "=========================================="
echo ""
echo "使用方式："
echo "1. 在 FastAPI 中导入："
echo "   from dify.services.dify import DifyClient, DatasetService"
echo ""
echo "2. 或挂载路由："
echo "   from dify.services.dify.api import router as dify_router"
echo "   app.include_router(dify_router)"
echo ""
