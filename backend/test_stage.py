"""Test each AI pipeline stage with deep thinking (text mode)."""
import httpx, asyncio, json, time, sys

BASE = "http://govai-backend:8000/api/v1"

async def login():
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(f"{BASE}/auth/login", json={"username": "admin", "password": "123456qq"})
        if r.status_code != 200:
            print(f"Login failed: {r.status_code} {r.text[:200]}")
            sys.exit(1)
        token = r.json()["data"]["access_token"]
        print(f"Login OK")
        return token

async def get_doc_id(token):
    async with httpx.AsyncClient(timeout=10) as c:
        headers = {"Authorization": f"Bearer {token}"}
        r = await c.get(f"{BASE}/documents?category=doc&page=1&page_size=1", headers=headers)
        docs = r.json()["data"]["items"]
        if not docs:
            print("No documents found!")
            sys.exit(1)
        doc_id = docs[0]["id"]
        print(f"Doc: {doc_id} - {docs[0].get('title', '?')}")
        return doc_id

async def test_stage(token, doc_id, stage, body):
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    body["stage"] = stage

    start = time.time()
    events = {}
    full_text = ""
    reasoning_text = ""
    suggestions = []
    paragraphs = []
    error_msg = ""

    try:
        async with httpx.AsyncClient(timeout=300) as c:
            async with c.stream("POST", f"{BASE}/documents/{doc_id}/ai-process",
                                headers=headers, json=body) as resp:
                print(f"  HTTP {resp.status_code}")
                if resp.status_code >= 400:
                    body_text = ""
                    async for chunk in resp.aiter_text():
                        body_text += chunk
                    print(f"  Error body: {body_text[:300]}")
                    return False

                async for line in resp.aiter_lines():
                    line = line.strip()
                    if not line:
                        continue
                    if line.startswith("data:"):
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            d = json.loads(data_str)
                        except:
                            continue
                        evt = d.get("type", "?")
                        events[evt] = events.get(evt, 0) + 1
                        elapsed = time.time() - start

                        if evt == "text_chunk":
                            full_text += d.get("text", "")
                        elif evt == "reasoning":
                            reasoning_text = d.get("reasoning_text", d.get("text", ""))
                        elif evt == "review_suggestion":
                            suggestions.append(d)
                        elif evt == "format_suggestion":
                            suggestions.append(d)
                        elif evt == "structured_paragraph":
                            paragraphs.append(d)
                        elif evt == "error":
                            error_msg = d.get("message", "unknown error")
                            print(f"  [{elapsed:.1f}s] ERROR: {error_msg}")
                        elif evt in ("progress", "status"):
                            msg = d.get("message", "")
                            if events[evt] <= 3 or events[evt] % 5 == 0:
                                print(f"  [{elapsed:.1f}s] {evt}: {msg}")
                        elif evt in ("message_end", "done"):
                            pass
                        elif evt in ("review_result", "review_suggestions"):
                            if d.get("suggestions"):
                                for s in d["suggestions"]:
                                    suggestions.append(s)
                        elif evt == "format_suggest_result":
                            if d.get("suggestions"):
                                for s in d["suggestions"]:
                                    suggestions.append(s)
    except Exception as e:
        print(f"  Exception: {type(e).__name__}: {e}")
        return False

    elapsed = time.time() - start
    print(f"  Time: {elapsed:.1f}s")
    print(f"  Events: {events}")
    has_reasoning = len(reasoning_text) > 0
    print(f"  Reasoning: {len(reasoning_text)} chars {'✓' if has_reasoning else '✗'}")

    if stage == "draft":
        print(f"  Text chunks: {len(full_text)} chars, Paragraphs: {len(paragraphs)}")
        if paragraphs:
            for i, p in enumerate(paragraphs[:3]):
                print(f"    [{i}] {p.get('style_type','?')}: {p.get('text','')[:60]}")
        elif full_text:
            print(f"  Preview: {full_text[:150]}...")
        ok = (len(full_text) > 0 or len(paragraphs) > 0) and not error_msg
    elif stage == "review":
        print(f"  Suggestions: {len(suggestions)}")
        for i, s in enumerate(suggestions[:3]):
            if isinstance(s, dict):
                cat = s.get('category', '?')
                orig = str(s.get('original', ''))[:50]
                sugg = str(s.get('suggestion', ''))[:50]
                print(f"    [{i}] {cat}: {orig} -> {sugg}")
        ok = len(suggestions) > 0 and not error_msg
    elif stage == "format_suggest":
        print(f"  Suggestions: {len(suggestions)}")
        for i, s in enumerate(suggestions[:3]):
            if isinstance(s, dict):
                cat = s.get('category', '?')
                target = str(s.get('target', ''))[:40]
                sugg = str(s.get('suggestion', ''))[:60]
                print(f"    [{i}] {cat}: {target} - {sugg}")
        ok = len(suggestions) > 0 and not error_msg
    elif stage == "format":
        print(f"  Paragraphs: {len(paragraphs)}")
        for i, p in enumerate(paragraphs[:3]):
            if isinstance(p, dict):
                st = p.get('style_type', '?')
                txt = str(p.get('text', ''))[:60]
                print(f"    [{i}] {st}: {txt}")
        ok = len(paragraphs) > 0 and not error_msg
    else:
        ok = not error_msg

    status = "✅ PASS" if ok else "❌ FAIL"
    print(f"  {status}")
    return ok

async def main():
    stage_arg = sys.argv[1] if len(sys.argv) > 1 else "all"
    token = await login()
    doc_id = await get_doc_id(token)

    results = {}

    if stage_arg in ("draft", "all"):
        print("\n=== 1. DRAFT (起草) ===")
        results["draft"] = await test_stage(token, doc_id, "draft", {
            "user_instruction": "请帮我起草一份关于加强网络安全管理的通知，字数200字以内",
        })

    if stage_arg in ("review", "all"):
        print("\n=== 2. REVIEW (审查) ===")
        results["review"] = await test_stage(token, doc_id, "review", {
            "user_instruction": "请检查文档问题",
            "existing_paragraphs": [
                {"text": "关于加强网络安全管理的通知", "style_type": "title"},
                {"text": "各部门，各单位：", "style_type": "body"},
                {"text": "为进一步加强我单位网络安全管理工作，根据《网络安全法》有关规定，现将有关事项通知如下：", "style_type": "body"},
                {"text": "一、提高思想认识，增强网络安全意识", "style_type": "body"},
                {"text": "各部门要充份认识网络安全的重要性，切实增强责任感和紧迫感。", "style_type": "body"},
            ],
        })

    if stage_arg in ("format_suggest", "all"):
        print("\n=== 3. FORMAT_SUGGEST (排版建议) ===")
        results["format_suggest"] = await test_stage(token, doc_id, "format_suggest", {
            "user_instruction": "",
            "existing_paragraphs": [
                {"text": "关于加强网络安全管理的通知", "style_type": "title"},
                {"text": "各部门，各单位：", "style_type": "body"},
                {"text": "为进一步加强我单位网络安全管理工作，现通知如下：", "style_type": "body"},
                {"text": "一、提高思想认识", "style_type": "body"},
                {"text": "二、完善制度建设", "style_type": "body"},
            ],
        })

    if stage_arg in ("format", "all"):
        print("\n=== 4. FORMAT (排版) ===")
        results["format"] = await test_stage(token, doc_id, "format", {
            "user_instruction": "按照公文标准格式排版",
            "existing_paragraphs": [
                {"text": "关于加强网络安全管理的通知", "style_type": "title"},
                {"text": "各部门，各单位：", "style_type": "body"},
                {"text": "为进一步加强我单位网络安全管理工作，现通知如下：", "style_type": "body"},
                {"text": "一、提高思想认识", "style_type": "body"},
            ],
        })

    print("\n" + "=" * 40)
    print("SUMMARY:")
    for stage, ok in results.items():
        print(f"  {stage}: {'✅' if ok else '❌'}")

asyncio.run(main())
