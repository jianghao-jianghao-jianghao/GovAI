#!/usr/bin/env python3
"""容器内 Dify 连接快速测试"""
import os, socket, httpx, asyncio

url = os.environ.get("DIFY_BASE_URL", "http://host.docker.internal:15001/v1")
key = os.environ.get("DIFY_DATASET_API_KEY", "")

# 解析 host 和 port
parts = url.replace("http://","").replace("https://","").split("/")[0].split(":")
host = parts[0]
port = int(parts[1]) if len(parts) > 1 else 80

print(f"Target: {host}:{port}")
print(f"URL: {url}")

# DNS
try:
    ip = socket.gethostbyname(host)
    print(f"DNS: {host} -> {ip}")
except Exception as e:
    print(f"DNS: FAIL - {e}")

# TCP
try:
    s = socket.create_connection((host, port), timeout=5)
    s.close()
    print(f"TCP: OK")
except Exception as e:
    print(f"TCP: FAIL - {e}")

# HTTP
async def test():
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{url}/datasets", headers={"Authorization": f"Bearer {key}"})
            print(f"HTTP: {r.status_code}")
            print(f"Body: {r.text[:200]}")
    except Exception as e:
        print(f"HTTP: FAIL - {type(e).__name__}: {e}")

asyncio.run(test())
