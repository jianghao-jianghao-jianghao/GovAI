#!/usr/bin/env python3
"""
GovAI Dify 连接诊断脚本
用于测试后端容器内是否能正常连接到 Dify API
"""

import asyncio
import json
import sys
from pathlib import Path

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent))

import httpx
from dotenv import load_dotenv
import os

# 加载环境变量
load_dotenv()

# 配置
DIFY_BASE_URL = os.getenv("DIFY_BASE_URL", "http://host.docker.internal:15001/v1")
DIFY_DATASET_API_KEY = os.getenv("DIFY_DATASET_API_KEY", "dataset-02rZJb5w1S39SMUQMXT2sQR2")

print("=" * 70)
print("🔍 Dify 连接诊断工具")
print("=" * 70)
print(f"📍 DIFY_BASE_URL: {DIFY_BASE_URL}")
print(f"🔑 DIFY_DATASET_API_KEY: {DIFY_DATASET_API_KEY[:20]}...")
print()


async def test_tcp_connection():
    """测试 TCP 连接"""
    print("📌 [步骤 1] 测试 TCP 连接...")
    try:
        url = DIFY_BASE_URL
        if url.startswith("http://"):
            host = url[7:].split("/")[0]
            port_part = host.split(":")
            if len(port_part) == 2:
                host, port = port_part[0], int(port_part[1])
            else:
                host, port = port_part[0], 80
        else:
            print("❌ 无法解析 URL")
            return False

        print(f"   尝试连接 {host}:{port}...")
        
        # 用 socket 直接测试 TCP
        import socket
        try:
            sock = socket.create_connection((host, port), timeout=5)
            sock.close()
            print(f"   ✅ socket TCP 连接成功")
            return True
        except Exception as e:
            print(f"   ❌ socket 连接失败: {e}")
            return False
    except Exception as e:
        print(f"   ❌ 测试异常: {e}")
        return False


async def test_http_request():
    """测试 HTTP 请求（GET /datasets）"""
    print("\n📌 [步骤 2] 测试 HTTP GET 请求...")
    try:
        headers = {
            "Authorization": f"Bearer {DIFY_DATASET_API_KEY}",
            "Content-Type": "application/json",
        }
        print(f"   URL: {DIFY_BASE_URL}/datasets")
        print(f"   Headers: Authorization, Content-Type")

        async with httpx.AsyncClient(timeout=10.0) as client:
            # 先尝试 GET（标准方法）
            print(f"   尝试 GET 请求...")
            try:
                resp = await client.get(
                    f"{DIFY_BASE_URL}/datasets",
                    headers=headers,
                )
                print(f"   ✅ GET 响应状态码: {resp.status_code}")
                if resp.status_code == 200:
                    data = resp.json()
                    print(f"   ✅ 响应数据有效")
                    return True
                else:
                    print(f"   ⚠️  非 200 状态码")
                    print(f"   响应: {resp.text[:200]}")
                    return False
            except Exception as e:
                print(f"   ❌ GET 失败: {type(e).__name__}: {str(e)[:100]}")
                
                # 尝试不带认证头
                print(f"   尝试不带 Authorization 头的 GET 请求...")
                try:
                    resp = await client.get(
                        f"{DIFY_BASE_URL}/datasets",
                        headers={"Content-Type": "application/json"},
                    )
                    print(f"   ✅ 无认证 GET 响应: {resp.status_code}")
                except Exception as e2:
                    print(f"   ❌ 无认证 GET 也失败: {type(e2).__name__}: {str(e2)[:100]}")
                
                return False
    except Exception as e:
        print(f"   ❌ 请求设置异常: {e}")
        return False


async def test_create_dataset():
    """测试创建知识库（POST /datasets）"""
    print("\n📌 [步骤 3] 测试 HTTP POST 请求（创建知识库）...")
    try:
        headers = {
            "Authorization": f"Bearer {DIFY_DATASET_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "name": f"test-dataset-{int(__import__('time').time())}",
            "description": "诊断测试",
            "permission": "only_me",
            "indexing_technique": "high_quality",
        }
        print(f"   URL: {DIFY_BASE_URL}/datasets")
        print(f"   Payload: {json.dumps(payload, ensure_ascii=False)}")

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{DIFY_BASE_URL}/datasets",
                headers=headers,
                json=payload,
            )
            print(f"   ✅ 响应状态码: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                dataset_id = data.get("id", "unknown")
                print(f"   ✅ 创建成功！数据集 ID: {dataset_id}")
                return True
            else:
                print(f"   ⚠️  非 200 状态码")
                print(f"   响应: {resp.text[:300]}")
                return False
    except Exception as e:
        print(f"   ❌ POST 请求失败: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_with_httpx_timeout():
    """测试不同的 timeout 配置"""
    print("\n📌 [步骤 4] 测试不同 timeout 配置...")
    timeouts = [5.0, (5.0, 10.0), httpx.Timeout(10.0, connect=5.0)]
    
    for timeout in timeouts:
        try:
            print(f"   尝试 timeout={timeout}...")
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.get(
                    f"{DIFY_BASE_URL}/datasets",
                    headers={"Authorization": f"Bearer {DIFY_DATASET_API_KEY}"},
                )
                print(f"   ✅ 成功 (状态码: {resp.status_code})")
        except Exception as e:
            print(f"   ❌ 失败: {type(e).__name__}: {str(e)[:50]}")


async def main():
    """主函数"""
    results = []
    
    # 测试 1: TCP 连接
    tcp_ok = await test_tcp_connection()
    results.append(("TCP 连接", tcp_ok))
    
    if not tcp_ok:
        print("\n🛑 TCP 连接失败，无法继续。请检查网络配置。")
        return
    
    # TCP 成功，继续 HTTP 测试（即使 OPTIONS 失败也继续）
    print("\n⚠️  OPTIONS 请求失败，但 TCP 连接成功。继续测试其他方法...")
    
    # 测试 2: HTTP GET
    get_ok = await test_http_request()
    results.append(("HTTP GET", get_ok))
    
    # 测试 3: HTTP POST
    post_ok = await test_create_dataset()
    results.append(("HTTP POST 创建知识库", post_ok))
    
    # 测试 4: 不同 timeout
    await test_with_httpx_timeout()
    
    # 总结
    print("\n" + "=" * 70)
    print("📊 诊断总结")
    print("=" * 70)
    for name, ok in results:
        status = "✅ 通过" if ok else "❌ 失败"
        print(f"{status} | {name}")
    
    all_ok = all(ok for _, ok in results)
    if all_ok:
        print("\n🎉 所有测试通过！Dify 连接正常。")
    else:
        print("\n⚠️  部分测试失败。请根据上方错误信息排查问题。")


if __name__ == "__main__":
    asyncio.run(main())
