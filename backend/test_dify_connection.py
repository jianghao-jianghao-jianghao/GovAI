"""测试 Dify 连接"""
import asyncio
import httpx

async def test_connection():
    base_url = "http://127.0.0.1:15001/v1"
    dataset_key = "dataset-02rZJb5w1S39SMUQMXT2sQR2"
    
    print("测试 Dify 连接...")
    print(f"Base URL: {base_url}")
    print(f"Dataset Key: {dataset_key}")
    print()
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{base_url}/datasets",
                headers={"Authorization": f"Bearer {dataset_key}"}
            )
            print(f"状态码: {resp.status_code}")
            print(f"响应: {resp.text[:500]}")
    except Exception as e:
        print(f"连接失败: {e}")

if __name__ == "__main__":
    asyncio.run(test_connection())
