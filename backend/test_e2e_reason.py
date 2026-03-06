import httpx, asyncio, json

async def test():
    base = "http://govai-backend:8000/api/v1"
    # Login
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(f"{base}/auth/login", json={"username": "admin", "password": "123456qq"})
        if r.json().get("data") is None:
            r = await c.post(f"{base}/auth/login", json={"username": "admin", "password": "admin123"})
        token = r.json()["data"]["access_token"]

    # Create session
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{base}/chat/sessions?page=1&page_size=1", headers=headers)
        sessions = r.json()["data"]["items"]
        if sessions:
            sid = sessions[0]["id"]
        else:
            r = await c.post(f"{base}/chat/sessions", headers=headers, json={"title": "test_reason"})
            sid = r.json()["data"]["id"]
        print("Session:", sid)

    # Send chat
    body = {"content": "1+1等于几"}
    reasoning_found = False
    event_types = []
    async with httpx.AsyncClient(timeout=120) as c:
        async with c.stream("POST", f"{base}/chat/sessions/{sid}/send", headers=headers, json=body) as resp:
            print("Status:", resp.status_code)
            current_event = ""
            async for line in resp.aiter_lines():
                line = line.strip()
                if not line:
                    continue
                if line.startswith("event:"):
                    current_event = line[6:].strip()
                    if current_event == "reasoning":
                        reasoning_found = True
                        print(">>> REASONING EVENT FOUND!")
                if line.startswith("data:"):
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        print("[DONE]")
                        break
                    try:
                        d = json.loads(data_str)
                        t = d.get("type", "?")
                        event_types.append(t)
                        txt = str(d.get("text", ""))[:80]
                        print(f"  [{current_event}] type={t} text={txt}")
                    except Exception:
                        print(f"  raw: {line[:100]}")

    print()
    print("Reasoning found:", reasoning_found)
    print("Event types:", event_types)

asyncio.run(test())
