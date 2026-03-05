import httpx, asyncio

async def t():
    base = 'http://localhost:8000/api/v1'
    for pw in ['admin123', 'Govai@2024', 'Admin123!', 'admin', '123456', 'govai2024']:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.post(base + '/auth/login', json={'username': 'admin', 'password': pw})
            d = r.json()
            if d.get('code') == 0:
                token = d['data']['access_token']
                print(f'SUCCESS: pw={pw}, token={token[:30]}...')
                return token
            print(f'Failed: pw={pw} -> {d.get("message")}')
    return None

asyncio.run(t())
