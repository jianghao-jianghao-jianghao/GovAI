"""检查当前配置加载情况"""
import sys
from pathlib import Path

# 添加 app 目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from app.core.config import settings

print("=" * 60)
print("当前配置加载情况")
print("=" * 60)
print(f"DIFY_MOCK: {settings.DIFY_MOCK}")
print(f"DIFY_BASE_URL: {settings.DIFY_BASE_URL}")
print(f"DIFY_DATASET_API_KEY: {settings.DIFY_DATASET_API_KEY[:20]}..." if settings.DIFY_DATASET_API_KEY else "未设置")
print("=" * 60)
