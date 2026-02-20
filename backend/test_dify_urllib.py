#!/usr/bin/env python3
"""
用 urllib 代替 httpx 测试 Dify 连接
"""

import json
import urllib.request
import urllib.error
import os
from dotenv import load_dotenv

load_dotenv()

DIFY_BASE_URL = os.getenv("DIFY_BASE_URL", "http://host.docker.internal:15001/v1")
DIFY_DATASET_API_KEY = os.getenv("DIFY_DATASET_API_KEY", "dataset-02rZJb5w1S39SMUQMXT2sQR2")

print("=" * 70)
print("🔍 用 urllib 测试 Dify 连接")
print("=" * 70)
print(f"📍 DIFY_BASE_URL: {DIFY_BASE_URL}")
print()

# 测试 1: GET /datasets
print("📌 [测试 1] GET /datasets")
try:
    req = urllib.request.Request(
        f"{DIFY_BASE_URL}/datasets",
        headers={"Authorization": f"Bearer {DIFY_DATASET_API_KEY}"},
        method="GET"
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        print(f"   ✅ 成功！状态码: {resp.status}")
        data = json.loads(resp.read().decode())
        print(f"   响应数据行数: {len(data.get('data', []))}")
except Exception as e:
    print(f"   ❌ 失败: {type(e).__name__}: {str(e)[:100]}")

print()

# 测试 2: POST /datasets
print("📌 [测试 2] POST /datasets")
try:
    payload = {
        "name": f"test-urllib",
        "description": "测试",
        "permission": "only_me",
        "indexing_technique": "high_quality"
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{DIFY_BASE_URL}/datasets",
        data=data,
        headers={
            "Authorization": f"Bearer {DIFY_DATASET_API_KEY}",
            "Content-Type": "application/json"
        },
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        print(f"   ✅ 成功！状态码: {resp.status}")
        result = json.loads(resp.read().decode())
        print(f"   创建的数据集 ID: {result.get('id', 'unknown')}")
except Exception as e:
    print(f"   ❌ 失败: {type(e).__name__}: {str(e)[:100]}")

print("\n✅ 测试完成")
