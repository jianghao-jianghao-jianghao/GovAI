"""
GovAI 智能公文处理 - 全阶段端到端测试
测试: 起草(draft) / 审查优化(review) / 格式化(format) / 排版建议(format_suggest)

使用方式:
  docker exec -w /app govai-backend python3 test_all_stages.py
  docker exec -w /app govai-backend python3 test_all_stages.py 1 3 5 9  # 只跑指定测试
"""

import httpx
import asyncio
import json
import time
import sys

BASE = "http://127.0.0.1:8000/api/v1"
USERNAME = "admin"
PASSWORD = "123456qq"


def _trunc(s, n=120):
    return s[:n] + "..." if len(s) > n else s


async def login():
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(f"{BASE}/auth/login", json={"username": USERNAME, "password": PASSWORD})
        r.raise_for_status()
        token = r.json()["data"]["access_token"]
        print(f"OK login (token: {token[:20]}...)")
        return token


async def get_doc_id(token):
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{BASE}/documents?category=doc&page=1&page_size=1", headers=headers)
        r.raise_for_status()
        items = r.json()["data"]["items"]
        if not items:
            raise RuntimeError("No documents found")
        doc_id = items[0]["id"]
        title = items[0].get("title", "?")
        print(f"Using doc: id={doc_id}  title={_trunc(title, 40)}")
        return doc_id


async def stream_ai_process(token, doc_id, body, label, timeout=180):
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    result = {
        "label": label, "events": [], "event_types": {},
        "paragraphs": [], "suggestions": [], "errors": [],
        "elapsed": 0, "status_code": 0,
    }
    start = time.time()

    try:
        async with httpx.AsyncClient(timeout=timeout) as c:
            async with c.stream(
                "POST", f"{BASE}/documents/{doc_id}/ai-process",
                headers=headers, json=body,
            ) as resp:
                result["status_code"] = resp.status_code
                if resp.status_code != 200:
                    body_text = await resp.aread()
                    result["errors"].append(f"HTTP {resp.status_code}: {body_text.decode()[:300]}")
                    return result

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
                            evt_type = d.get("type", "unknown")
                            result["events"].append(d)
                            result["event_types"][evt_type] = result["event_types"].get(evt_type, 0) + 1

                            if evt_type == "structured_paragraph":
                                p = d.get("paragraph", {})
                                result["paragraphs"].append(p)
                            elif evt_type == "format_suggestion":
                                result["suggestions"].append(d.get("suggestion", {}))
                            elif evt_type == "error":
                                result["errors"].append(d.get("message", "unknown error"))
                        except json.JSONDecodeError:
                            pass
    except httpx.ReadTimeout:
        result["errors"].append(f"ReadTimeout after {timeout}s")
    except Exception as e:
        result["errors"].append(f"{type(e).__name__}: {e}")

    result["elapsed"] = round(time.time() - start, 1)
    return result


def print_result(r):
    label = r["label"]
    ok = "PASS" if not r["errors"] else "FAIL"
    icon = "[OK]" if not r["errors"] else "[FAIL]"
    print(f"\n{'='*60}")
    print(f"{icon} [{label}]  time={r['elapsed']}s  HTTP={r['status_code']}")
    print(f"   events: {r['event_types']}")
    if r["paragraphs"]:
        print(f"   paragraphs: {len(r['paragraphs'])}")
        for i, p in enumerate(r["paragraphs"][:3]):
            st = p.get("style_type", "?")
            txt = _trunc(p.get("text", ""), 60)
            chg = p.get("_change", "")
            print(f"     [{i}] ({st}{' '+chg if chg else ''}) {txt}")
        if len(r["paragraphs"]) > 3:
            print(f"     ... +{len(r['paragraphs'])-3} more")
    if r["suggestions"]:
        print(f"   suggestions: {len(r['suggestions'])}")
        for i, s in enumerate(r["suggestions"][:3]):
            print(f"     [{i}] {_trunc(str(s), 80)}")
    if r["errors"]:
        print(f"   ERRORS: {r['errors']}")
    return ok


# -- Test data --

SHORT_PARAGRAPHS = [
    {"text": "关于加强数据安全管理的通知", "style_type": "title", "font_size": "22pt", "bold": True, "alignment": "center"},
    {"text": "各部门：", "style_type": "body"},
    {"text": "为进一步加强我单位数据安全管理工作，防范数据泄露风险，根据《数据安全法》《个人信息保护法》等法律法规，现就有关事项通知如下。", "style_type": "body"},
    {"text": "一、提高数据安全意识", "style_type": "heading1", "bold": True},
    {"text": "各部门要高度重视数据安全工作，将数据安全纳入日常工作考核范围，定期开展数据安全培训和演练。", "style_type": "body"},
    {"text": "二、完善数据分类分级制度", "style_type": "heading1", "bold": True},
    {"text": "按照《数据安全法》要求，建立数据分类分级保护制度，明确各类数据的安全等级和保护措施。", "style_type": "body"},
    {"text": "三、加强数据全生命周期管理", "style_type": "heading1", "bold": True},
    {"text": "从数据采集、存储、使用、加工、传输、提供、公开等各环节加强安全管理。", "style_type": "body"},
    {"text": "特此通知。", "style_type": "body"},
]


def make_long_paragraphs(count=80):
    paras = [
        {"text": "Hyper-Alpha-Arena 代码可靠性与健壮性分析报告", "style_type": "body"},
        {"text": "一、概述", "style_type": "body"},
        {"text": "本报告对 Hyper-Alpha-Arena 项目的代码进行全面的可靠性和健壮性分析。", "style_type": "body"},
    ]
    for i in range(count):
        section = (i // 10) + 1
        if i % 10 == 0:
            paras.append({"text": f"{section}. 模块{section}分析", "style_type": "body"})
        paras.append({
            "text": (f"在模块{section}的第{i%10+1}个检查点中，发现以下问题：变量命名不规范，"
                     f"缺少异常处理机制，函数圈复杂度过高（CC={10+i%5}），代码重复率达到{15+i%3}%。"
                     f"建议重构该模块的核心逻辑，引入设计模式降低耦合度。"),
            "style_type": "body",
        })
    return paras


# -- Test cases --

async def test_draft_new(token, doc_id):
    """测试1: 起草-新建文档"""
    body = {
        "stage": "draft",
        "user_instruction": "帮我起草一份关于加强网络安全管理的通知，要求包含三个主要部分。",
    }
    return await stream_ai_process(token, doc_id, body, "起草-新建文档")


async def test_draft_rewrite(token, doc_id):
    """测试2: 起草-追加内容"""
    body = {
        "stage": "draft",
        "user_instruction": "在现有内容基础上，添加一节关于应急响应预案的内容。",
        "existing_paragraphs": SHORT_PARAGRAPHS,
    }
    return await stream_ai_process(token, doc_id, body, "起草-追加内容")


async def test_review_short(token, doc_id):
    """测试3: 审查-短文本"""
    body = {
        "stage": "review",
        "user_instruction": "请审查优化这份通知的用词和格式。",
        "existing_paragraphs": SHORT_PARAGRAPHS,
    }
    return await stream_ai_process(token, doc_id, body, "审查-短文本")


async def test_review_long(token, doc_id):
    """测试4: 审查-长文本(80+段)"""
    long_paras = make_long_paragraphs(80)
    body = {
        "stage": "review",
        "user_instruction": "请审查这份报告的格式和内容。",
        "existing_paragraphs": long_paras,
    }
    return await stream_ai_process(token, doc_id, body, f"审查-长文本({len(long_paras)}段)", timeout=300)


async def test_format_short(token, doc_id):
    """测试5: 格式化-短文本增量"""
    body = {
        "stage": "format",
        "user_instruction": "进行合理格式化排版",
        "existing_paragraphs": SHORT_PARAGRAPHS,
    }
    return await stream_ai_process(token, doc_id, body, "格式化-短文本增量")


async def test_format_long(token, doc_id):
    """测试6: 格式化-长文本全body(80+段)"""
    long_paras = make_long_paragraphs(80)
    body = {
        "stage": "format",
        "user_instruction": "进行合理格式化排版",
        "existing_paragraphs": long_paras,
    }
    return await stream_ai_process(token, doc_id, body, f"格式化-长文本全body({len(long_paras)}段)", timeout=600)


async def test_format_long_mixed(token, doc_id):
    """测试7: 格式化-长文本混合样式(80+段)"""
    long_paras = make_long_paragraphs(80)
    for i, p in enumerate(long_paras):
        if i % 3 == 0:
            p["style_type"] = "heading1"
            p["bold"] = True
        elif i % 7 == 0:
            p["style_type"] = "heading2"
    body = {
        "stage": "format",
        "user_instruction": "进行合理格式化排版",
        "existing_paragraphs": long_paras,
    }
    return await stream_ai_process(token, doc_id, body, f"格式化-长文本混合({len(long_paras)}段)", timeout=600)


async def test_format_plain_text(token, doc_id):
    """测试8: 格式化-纯文本"""
    body = {
        "stage": "format",
        "user_instruction": "进行合理格式化排版",
    }
    return await stream_ai_process(token, doc_id, body, "格式化-纯文本")


async def test_format_suggest(token, doc_id):
    """测试9: 排版建议"""
    body = {
        "stage": "format_suggest",
        "existing_paragraphs": SHORT_PARAGRAPHS,
    }
    return await stream_ai_process(token, doc_id, body, "排版建议")


# -- Main --

async def main():
    print("=" * 60)
    print("GovAI All-Stage Test")
    print("=" * 60)

    token = await login()
    doc_id = await get_doc_id(token)

    all_tests = [
        test_draft_new, test_draft_rewrite,
        test_review_short, test_review_long,
        test_format_short, test_format_long, test_format_long_mixed,
        test_format_plain_text, test_format_suggest,
    ]

    tests = all_tests
    if len(sys.argv) > 1:
        indices = [int(x) - 1 for x in sys.argv[1:] if x.isdigit()]
        tests = [all_tests[i] for i in indices if 0 <= i < len(all_tests)]

    results = []
    for test_fn in tests:
        print(f"\n>>> Starting: {test_fn.__doc__}")
        r = await test_fn(token, doc_id)
        ok = print_result(r)
        results.append((ok, r))

    print(f"\n{'='*60}")
    print("SUMMARY")
    print("=" * 60)
    p = 0
    f = 0
    for ok, r in results:
        icon = "[OK]" if ok == "PASS" else "[FAIL]"
        para_info = f"{len(r['paragraphs'])}p" if r["paragraphs"] else ""
        sug_info = f"{len(r['suggestions'])}s" if r["suggestions"] else ""
        extra = " ".join(filter(None, [para_info, sug_info]))
        print(f"  {icon} {r['label']:35s} {r['elapsed']:6.1f}s  {extra}")
        if ok == "PASS":
            p += 1
        else:
            f += 1
            for e in r["errors"]:
                print(f"       err: {e[:120]}")
    print(f"\nPassed: {p}  Failed: {f}  Total: {len(results)}")


if __name__ == "__main__":
    asyncio.run(main())
