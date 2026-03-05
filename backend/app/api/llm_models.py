"""
Dify AI 服务配置状态 — 展示当前系统已配置的 Dify AI 应用及其连通状态。

本系统所有模型均通过 Dify 平台管理，此模块提供：
1. 查看当前已配置的 Dify AI 应用列表
2. 测试各 Dify AI 应用的连通性
3. Dify 服务整体状态概览
"""

import logging
import time

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.response import success, error, ErrorCode
from app.core.deps import require_permission
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/models", tags=["DifyServiceConfig"])


# ── Dify AI 应用配置定义 ──
DIFY_APPS = [
    {
        "key": "qa_chat",
        "name": "智能问答",
        "description": "知识库检索 + LLM 推理的对话式问答",
        "category": "core",
        "env_key": "DIFY_APP_CHAT_KEY",
    },
    {
        "key": "doc_draft",
        "name": "公文起草",
        "description": "基于模板和参考资料生成公文",
        "category": "document",
        "env_key": "DIFY_APP_DOC_DRAFT_KEY",
    },
    {
        "key": "doc_check",
        "name": "公文审查",
        "description": "检查公文中的错字、语病、敏感词等",
        "category": "document",
        "env_key": "DIFY_APP_DOC_CHECK_KEY",
    },
    {
        "key": "format_suggest",
        "name": "排版建议",
        "description": "分析文档格式并给出排版优化建议",
        "category": "document",
        "env_key": "DIFY_APP_FORMAT_SUGGEST_KEY",
    },
    {
        "key": "doc_format",
        "name": "智能排版",
        "description": "分析文档结构并进行标准化排版",
        "category": "document",
        "env_key": "DIFY_APP_DOC_FORMAT_KEY",
    },
    {
        "key": "entity_extract",
        "name": "实体抽取",
        "description": "从文本中提取实体和关系用于知识图谱",
        "category": "knowledge",
        "env_key": "DIFY_APP_ENTITY_EXTRACT_KEY",
    },
    {
        "key": "dataset",
        "name": "知识库管理",
        "description": "Dify 知识库的文档上传、检索等",
        "category": "knowledge",
        "env_key": "DIFY_DATASET_API_KEY",
    },
]

CATEGORY_MAP = {
    "core": "核心服务",
    "document": "公文处理",
    "knowledge": "知识管理",
}


def _get_api_key_for_app(app_def: dict) -> str:
    """从 settings 中获取对应的 API Key"""
    key_map = {
        "DIFY_APP_CHAT_KEY": settings.DIFY_APP_CHAT_KEY,
        "DIFY_APP_DOC_DRAFT_KEY": settings.DIFY_APP_DOC_DRAFT_KEY,
        "DIFY_APP_DOC_CHECK_KEY": settings.DIFY_APP_DOC_CHECK_KEY,
        "DIFY_APP_FORMAT_SUGGEST_KEY": settings.DIFY_APP_FORMAT_SUGGEST_KEY,
        "DIFY_APP_DOC_FORMAT_KEY": settings.DIFY_APP_DOC_FORMAT_KEY,
        "DIFY_APP_ENTITY_EXTRACT_KEY": settings.DIFY_APP_ENTITY_EXTRACT_KEY,
        "DIFY_DATASET_API_KEY": settings.DIFY_DATASET_API_KEY,
    }
    return key_map.get(app_def["env_key"], "")


# ── 服务列表 ──
@router.get("/list")
async def list_dify_apps(
    current_user: User = Depends(require_permission("sys:model:manage")),
):
    """获取已配置的 Dify AI 应用列表及状态"""
    items = []
    configured_count = 0

    for app_def in DIFY_APPS:
        api_key = _get_api_key_for_app(app_def)
        is_configured = bool(api_key)
        if is_configured:
            configured_count += 1

        items.append({
            "key": app_def["key"],
            "name": app_def["name"],
            "description": app_def["description"],
            "category": app_def["category"],
            "category_label": CATEGORY_MAP.get(app_def["category"], app_def["category"]),
            "is_configured": is_configured,
            "has_api_key": is_configured,
        })

    # 将 dify_mock 转为布尔值，避免前端 "false" 字符串被误判为 truthy
    mock_mode = str(settings.DIFY_MOCK).lower().strip() in ("true", "1", "yes")

    # Console URL：必须是浏览器可达的地址，不能用容器内部域名
    # 优先使用显式配置 DIFY_CONSOLE_URL，否则不自动推导（因为 DIFY_BASE_URL 是容器内地址）
    console_url = settings.DIFY_CONSOLE_URL

    return success(data={
        "items": items,
        "total": len(items),
        "configured_count": configured_count,
        "dify_base_url": settings.DIFY_BASE_URL or "(未设置)",
        "dify_mock": mock_mode,
        "dify_console_url": console_url or "",
    })


# ── 连通性测试 (单个应用) ──
@router.post("/{app_key}/test")
async def test_dify_app(
    app_key: str,
    current_user: User = Depends(require_permission("sys:model:manage")),
):
    """测试某个 Dify AI 应用的连通性"""
    # 找到对应的配置
    app_def = next((a for a in DIFY_APPS if a["key"] == app_key), None)
    if not app_def:
        return error(ErrorCode.NOT_FOUND, f"未知的 AI 应用: {app_key}")

    api_key = _get_api_key_for_app(app_def)
    if not api_key:
        return error(ErrorCode.PARAM_INVALID, f"{app_def['name']} 未配置 API Key")

    base_url = settings.DIFY_BASE_URL
    if not base_url:
        return error(ErrorCode.PARAM_INVALID, "DIFY_BASE_URL 未配置")

    # 知识库类型走 /datasets API
    if app_key == "dataset":
        test_url = f"{base_url}/datasets?page=1&limit=1"
        headers = {"Authorization": f"Bearer {api_key}"}
    else:
        # Chatflow / Workflow 类型走 /parameters API（轻量级接口，不触发 LLM）
        test_url = f"{base_url}/parameters"
        headers = {"Authorization": f"Bearer {api_key}"}

    try:
        t0 = time.time()
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(test_url, headers=headers)
        elapsed_ms = int((time.time() - t0) * 1000)

        if resp.status_code == 200:
            return success(
                data={"status": "ok", "response_time_ms": elapsed_ms},
                message=f"{app_def['name']} 连接正常"
            )
        else:
            detail = ""
            try:
                body = resp.json()
                detail = body.get("message", "")[:200]
            except Exception:
                detail = resp.text[:200]
            return error(
                ErrorCode.DIFY_ERROR,
                f"连接失败: HTTP {resp.status_code} — {detail}"
            )
    except httpx.ConnectError:
        return error(ErrorCode.DIFY_ERROR, f"连接失败: 无法连接到 {base_url}")
    except httpx.TimeoutException:
        return error(ErrorCode.DIFY_ERROR, "连接超时")
    except Exception as e:
        return error(ErrorCode.DIFY_ERROR, f"测试失败: {str(e)}")


# ── 批量连通性测试 ──
@router.post("/test-all")
async def test_all_dify_apps(
    current_user: User = Depends(require_permission("sys:model:manage")),
):
    """批量测试所有已配置的 Dify AI 应用连通性"""
    results = []
    base_url = settings.DIFY_BASE_URL

    for app_def in DIFY_APPS:
        api_key = _get_api_key_for_app(app_def)
        if not api_key:
            results.append({
                "key": app_def["key"],
                "name": app_def["name"],
                "status": "not_configured",
                "message": "未配置",
            })
            continue

        if not base_url:
            results.append({
                "key": app_def["key"],
                "name": app_def["name"],
                "status": "error",
                "message": "DIFY_BASE_URL 未设置",
            })
            continue

        if app_def["key"] == "dataset":
            test_url = f"{base_url}/datasets?page=1&limit=1"
        else:
            test_url = f"{base_url}/parameters"
        headers = {"Authorization": f"Bearer {api_key}"}

        try:
            t0 = time.time()
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(test_url, headers=headers)
            elapsed_ms = int((time.time() - t0) * 1000)

            if resp.status_code == 200:
                results.append({
                    "key": app_def["key"],
                    "name": app_def["name"],
                    "status": "ok",
                    "response_time_ms": elapsed_ms,
                    "message": "正常",
                })
            else:
                results.append({
                    "key": app_def["key"],
                    "name": app_def["name"],
                    "status": "error",
                    "message": f"HTTP {resp.status_code}",
                })
        except Exception as e:
            results.append({
                "key": app_def["key"],
                "name": app_def["name"],
                "status": "error",
                "message": str(e)[:100],
            })

    ok_count = sum(1 for r in results if r["status"] == "ok")
    total_configured = sum(1 for r in results if r["status"] != "not_configured")

    return success(data={
        "results": results,
        "ok_count": ok_count,
        "total_configured": total_configured,
        "total": len(results),
    })

