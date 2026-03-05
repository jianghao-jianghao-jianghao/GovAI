"""End-to-end test for the review SSE fix using httpx."""
import httpx
import json
import time
import sys

BASE = "http://127.0.0.1:8000/api/v1"

# 1. Login
with httpx.Client(timeout=30) as client:
    r = client.post(f"{BASE}/auth/login", json={"username": "admin", "password": "admin123"})
    print(f"Login: {r.status_code}")
    if r.status_code != 200:
        print("Login failed:", r.text)
        sys.exit(1)
    token = r.json()["access_token"]
    print(f"Token: {token[:20]}...")

    headers = {"Authorization": f"Bearer {token}"}

    # 2. List documents
    r2 = client.get(f"{BASE}/documents/", headers=headers)
    docs = r2.json()
    print(f"\nDocuments: {len(docs)} found")
    if not docs:
        print("No documents to test with!")
        sys.exit(1)

    # Pick first doc
    doc = docs[0]
    doc_id = doc["id"]
    title = doc.get("title", "?")
    print(f"Using doc: id={doc_id}, title={title[:40]}")

    # Get paragraphs
    r3 = client.get(f"{BASE}/documents/{doc_id}", headers=headers)
    detail = r3.json()
    content = detail.get("content", "")
    paras = detail.get("paragraphs") or detail.get("ai_structured_paragraphs") or []
    if not paras and content:
        paras = [{"heading": "测试段落", "content": content[:200]}]
    print(f"Paragraphs: {len(paras)}")

# 3. Test review SSE with streaming
print(f"\n{'='*60}")
print("Starting review SSE test...")
print(f"{'='*60}")

payload = {
    "stage": "review",
    "user_instruction": "帮我检查格式",
    "existing_paragraphs": paras[:3]
}

start = time.time()
event_count = 0
event_types = {}
first_event_time = None
last_event_time = None

try:
    with httpx.Client(timeout=httpx.Timeout(connect=10, read=120, write=10, pool=10)) as client:
        with client.stream(
            "POST",
            f"{BASE}/documents/{doc_id}/ai-process",
            headers={**headers, "Accept": "text/event-stream"},
            json=payload,
        ) as resp:
            print(f"Response status: {resp.status_code}")
            if resp.status_code != 200:
                resp.read()
                print(f"Error: {resp.text[:500]}")
                sys.exit(1)

            buffer = ""
            for chunk in resp.iter_text():
                if chunk:
                    buffer += chunk
                    while "\n\n" in buffer:
                        event_str, buffer = buffer.split("\n\n", 1)
                        data_line = None
                        event_name = None
                        for line in event_str.strip().split("\n"):
                            if line.startswith("data: "):
                                data_line = line[6:]
                            elif line.startswith("event: "):
                                event_name = line[7:]

                        if data_line:
                            now = time.time()
                            elapsed = now - start
                            event_count += 1
                            if first_event_time is None:
                                first_event_time = elapsed
                            last_event_time = elapsed

                            try:
                                data = json.loads(data_line)
                                etype = data.get("type", "unknown")
                                event_types[etype] = event_types.get(etype, 0) + 1
                                status = data.get("status", "")
                                msg = data.get("message", "")[:80] if data.get("message") else ""

                                print(f"  [{elapsed:5.1f}s] #{event_count}: type={etype}, status={status}")
                                if msg:
                                    print(f"         msg: {msg}")
                                if etype == "suggestion":
                                    print(f"         (suggestion data)")
                            except json.JSONDecodeError:
                                print(f"  [{elapsed:5.1f}s] #{event_count}: raw={data_line[:80]}")

except httpx.TimeoutException:
    print(f"\nTIMEOUT after {time.time()-start:.1f}s")
except Exception as e:
    print(f"\nError: {type(e).__name__}: {e}")

# Summary
print(f"\n{'='*60}")
print("SUMMARY")
print(f"{'='*60}")
print(f"Total events: {event_count}")
print(f"Event types: {event_types}")
if first_event_time is not None:
    print(f"First event at: {first_event_time:.1f}s")
else:
    print("No events received!")
if last_event_time is not None:
    print(f"Last event at: {last_event_time:.1f}s")
print(f"Total time: {time.time()-start:.1f}s")

progress_count = event_types.get("progress", 0)
if progress_count > 0:
    print(f"\n✅ PASS: {progress_count} progress events (think-phase heartbeats working!)")
else:
    print(f"\n⚠️  No progress events (think phase may have been very short)")

if event_count > 0:
    print("✅ PASS: SSE stream is working!")
else:
    print("❌ FAIL: No events received!")
