"""测试 Dify 应用类型"""
import asyncio
import httpx

async def test_app_type():
    base_url = "http://127.0.0.1:15001/v1"
    
    # 测试的 API keys
    test_keys = {
        "DOC_DRAFT": "app-x0x62zW8Q1E7Af67BzIbQ2uM",
        "DOC_CHECK": "app-InMoZbeKb9xvyWzXuiCdaeLx",
        "DOC_OPTIMIZE": "app-ENbuU0AzTtN2yQqoR49s2F47",
    }
    
    for name, api_key in test_keys.items():
        print(f"\n{'='*60}")
        print(f"测试 {name}: {api_key}")
        print('='*60)
        
        # 测试 Workflow API
        print("\n1. 测试 Workflow API (/workflows/run):")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{base_url}/workflows/run",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "inputs": {"test": "test"},
                        "response_mode": "blocking",
                        "user": "test"
                    }
                )
                print(f"   状态码: {resp.status_code}")
                print(f"   响应: {resp.text[:200]}")
        except Exception as e:
            print(f"   错误: {e}")
        
        # 测试 Completion API
        print("\n2. 测试 Completion API (/completion-messages):")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{base_url}/completion-messages",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "inputs": {"test": "test"},
                        "response_mode": "blocking",
                        "user": "test"
                    }
                )
                print(f"   状态码: {resp.status_code}")
                print(f"   响应: {resp.text[:200]}")
        except Exception as e:
            print(f"   错误: {e}")
        
        # 测试 Chat API
        print("\n3. 测试 Chat API (/chat-messages):")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{base_url}/chat-messages",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "query": "test",
                        "inputs": {},
                        "response_mode": "blocking",
                        "user": "test"
                    }
                )
                print(f"   状态码: {resp.status_code}")
                print(f"   响应: {resp.text[:200]}")
        except Exception as e:
            print(f"   错误: {e}")

if __name__ == "__main__":
    asyncio.run(test_app_type())
