"""模型管理路由"""

import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.response import success, error, ErrorCode
from app.core.deps import require_permission
from app.core.audit import log_action
from app.models.user import User
from app.models.llm_model import LLMModel

router = APIRouter(prefix="/models", tags=["ModelManagement"])

# ── 模型用途映射 ──
MODEL_TYPE_MAP = {
    "text_generation": "文本生成",
    "semantic_understanding": "语义理解",
    "knowledge_qa": "知识问答",
    "embedding": "向量嵌入",
    "other": "其他",
}

DEPLOYMENT_MAP = {
    "local": "本地部署",
    "remote": "远端服务",
}


def _model_to_dict(m: LLMModel) -> dict:
    """模型 → 字典"""
    return {
        "id": str(m.id),
        "name": m.name,
        "provider": m.provider,
        "model_id": m.model_id,
        "model_type": m.model_type,
        "model_type_label": MODEL_TYPE_MAP.get(m.model_type, m.model_type),
        "deployment": m.deployment,
        "deployment_label": DEPLOYMENT_MAP.get(m.deployment, m.deployment),
        "endpoint_url": m.endpoint_url,
        "has_api_key": bool(m.api_key),
        "temperature": m.temperature,
        "max_tokens": m.max_tokens,
        "top_p": m.top_p,
        "top_k": m.top_k,
        "frequency_penalty": m.frequency_penalty,
        "presence_penalty": m.presence_penalty,
        "extra_params": m.extra_params,
        "is_active": m.is_active,
        "is_default": m.is_default,
        "description": m.description,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }


# ── 列表 ──
@router.get("/list")
async def list_models(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    model_type: str = Query(None, description="按用途筛选"),
    deployment: str = Query(None, description="按部署方式筛选"),
    keyword: str = Query(None, description="名称搜索"),
    is_active: bool = Query(None, description="启用状态"),
    current_user: User = Depends(require_permission("sys:model:manage")),
    db: AsyncSession = Depends(get_db),
):
    """模型列表"""
    query = select(LLMModel)
    if model_type:
        query = query.where(LLMModel.model_type == model_type)
    if deployment:
        query = query.where(LLMModel.deployment == deployment)
    if keyword:
        query = query.where(LLMModel.name.ilike(f"%{keyword}%"))
    if is_active is not None:
        query = query.where(LLMModel.is_active == is_active)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    query = query.order_by(LLMModel.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    models = result.scalars().all()

    return success(data={
        "items": [_model_to_dict(m) for m in models],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


# ── 详情 ──
@router.get("/{model_id}")
async def get_model(
    model_id: str,
    current_user: User = Depends(require_permission("sys:model:manage")),
    db: AsyncSession = Depends(get_db),
):
    """获取模型详情"""
    result = await db.execute(select(LLMModel).where(LLMModel.id == uuid.UUID(model_id)))
    model = result.scalar_one_or_none()
    if not model:
        return error(ErrorCode.NOT_FOUND, "模型不存在")
    return success(data=_model_to_dict(model))


# ── 创建 ──
@router.post("/create")
async def create_model(
    body: dict,
    current_user: User = Depends(require_permission("sys:model:manage")),
    db: AsyncSession = Depends(get_db),
):
    """创建模型配置"""
    model = LLMModel(
        name=body["name"],
        provider=body["provider"],
        model_id=body["model_id"],
        model_type=body["model_type"],
        deployment=body.get("deployment", "remote"),
        endpoint_url=body["endpoint_url"],
        api_key=body.get("api_key"),
        temperature=body.get("temperature", 0.7),
        max_tokens=body.get("max_tokens", 2048),
        top_p=body.get("top_p", 0.9),
        top_k=body.get("top_k", 50),
        frequency_penalty=body.get("frequency_penalty", 0.0),
        presence_penalty=body.get("presence_penalty", 0.0),
        extra_params=body.get("extra_params"),
        is_active=body.get("is_active", True),
        is_default=body.get("is_default", False),
        description=body.get("description"),
    )

    # 若设为默认，则取消同类型其他默认
    if model.is_default:
        await db.execute(
            update(LLMModel)
            .where(LLMModel.model_type == model.model_type, LLMModel.is_default == True)
            .values(is_default=False)
        )

    db.add(model)
    await db.flush()

    await log_action(
        db,
        user_id=current_user.id,
        user_display_name=current_user.display_name,
        action="创建模型",
        module="模型管理",
        detail=f"创建模型: {model.name} ({model.model_id})",
    )

    return success(data=_model_to_dict(model), message="模型创建成功")


# ── 更新 ──
@router.put("/{model_id}")
async def update_model(
    model_id: str,
    body: dict,
    current_user: User = Depends(require_permission("sys:model:manage")),
    db: AsyncSession = Depends(get_db),
):
    """更新模型配置"""
    result = await db.execute(select(LLMModel).where(LLMModel.id == uuid.UUID(model_id)))
    model = result.scalar_one_or_none()
    if not model:
        return error(ErrorCode.NOT_FOUND, "模型不存在")

    updatable = [
        "name", "provider", "model_id", "model_type", "deployment",
        "endpoint_url", "temperature", "max_tokens", "top_p", "top_k",
        "frequency_penalty", "presence_penalty", "extra_params",
        "is_active", "is_default", "description",
    ]
    for key in updatable:
        if key in body:
            setattr(model, key, body[key])

    # api_key 只在有值时更新（避免清空）
    if body.get("api_key"):
        model.api_key = body["api_key"]

    # 若设为默认，取消同类型其他默认
    if body.get("is_default"):
        await db.execute(
            update(LLMModel)
            .where(LLMModel.model_type == model.model_type, LLMModel.is_default == True, LLMModel.id != model.id)
            .values(is_default=False)
        )

    model.updated_at = datetime.now(timezone.utc)
    await db.flush()

    await log_action(
        db,
        user_id=current_user.id,
        user_display_name=current_user.display_name,
        action="更新模型",
        module="模型管理",
        detail=f"更新模型: {model.name}",
    )

    return success(data=_model_to_dict(model), message="模型更新成功")


# ── 删除 ──
@router.delete("/{model_id}")
async def delete_model(
    model_id: str,
    current_user: User = Depends(require_permission("sys:model:manage")),
    db: AsyncSession = Depends(get_db),
):
    """删除模型"""
    result = await db.execute(select(LLMModel).where(LLMModel.id == uuid.UUID(model_id)))
    model = result.scalar_one_or_none()
    if not model:
        return error(ErrorCode.NOT_FOUND, "模型不存在")

    model_name = model.name
    await db.delete(model)
    await db.flush()

    await log_action(
        db,
        user_id=current_user.id,
        user_display_name=current_user.display_name,
        action="删除模型",
        module="模型管理",
        detail=f"删除模型: {model_name}",
    )

    return success(message="模型删除成功")


# ── 连通性测试 ──
@router.post("/{model_id}/test")
async def test_model_connection(
    model_id: str,
    current_user: User = Depends(require_permission("sys:model:manage")),
    db: AsyncSession = Depends(get_db),
):
    """测试模型连通性"""
    result = await db.execute(select(LLMModel).where(LLMModel.id == uuid.UUID(model_id)))
    model = result.scalar_one_or_none()
    if not model:
        return error(ErrorCode.NOT_FOUND, "模型不存在")

    try:
        headers = {"Content-Type": "application/json"}
        if model.api_key:
            headers["Authorization"] = f"Bearer {model.api_key}"

        # 发送简单的 chat completion 请求进行测试
        test_payload = {
            "model": model.model_id,
            "messages": [{"role": "user", "content": "你好"}],
            "max_tokens": 10,
            "temperature": 0.1,
        }

        async with httpx.AsyncClient(timeout=15) as client:
            endpoint = model.endpoint_url.rstrip("/")
            # 兼容 OpenAI 格式
            if not endpoint.endswith("/chat/completions"):
                endpoint = f"{endpoint}/chat/completions"
            resp = await client.post(endpoint, json=test_payload, headers=headers)

        if resp.status_code == 200:
            return success(data={"status": "ok", "response_time_ms": int(resp.elapsed.total_seconds() * 1000)},
                           message="连接成功")
        else:
            return error(ErrorCode.DIFY_ERROR,
                         f"连接失败: HTTP {resp.status_code} - {resp.text[:200]}")
    except httpx.ConnectError:
        return error(ErrorCode.DIFY_ERROR, "连接失败: 无法连接到模型端点")
    except httpx.TimeoutException:
        return error(ErrorCode.DIFY_ERROR, "连接超时: 请检查端点地址是否正确")
    except Exception as e:
        return error(ErrorCode.DIFY_ERROR, f"测试失败: {str(e)}")


# ── 按类型获取默认模型 ──
@router.get("/default/{model_type}")
async def get_default_model(
    model_type: str,
    current_user: User = Depends(require_permission("sys:model:manage")),
    db: AsyncSession = Depends(get_db),
):
    """获取某类型的默认模型"""
    result = await db.execute(
        select(LLMModel).where(LLMModel.model_type == model_type, LLMModel.is_default == True, LLMModel.is_active == True)
    )
    model = result.scalar_one_or_none()
    if not model:
        return error(ErrorCode.NOT_FOUND, f"未设置 {MODEL_TYPE_MAP.get(model_type, model_type)} 的默认模型")
    return success(data=_model_to_dict(model))


# ── 模型参数说明 (供前端展示) ──
@router.get("/meta/param-info")
async def get_param_info(
    current_user: User = Depends(require_permission("sys:model:manage")),
):
    """返回模型参数说明与推荐值"""
    return success(data=[
        {
            "key": "temperature",
            "label": "温度 (Temperature)",
            "description": "控制生成文本的随机性。值越高，输出越多样和有创意；值越低，输出越确定和保守。",
            "type": "float",
            "min": 0,
            "max": 2,
            "step": 0.1,
            "default": 0.7,
            "recommended": 0.7,
            "tips": "公文写作建议 0.3-0.5，创意写作建议 0.7-1.0，精确问答建议 0.1-0.3"
        },
        {
            "key": "max_tokens",
            "label": "最大长度 (Max Tokens)",
            "description": "模型单次生成的最大 Token 数量。1个中文字约 1-2 个 Token。",
            "type": "integer",
            "min": 1,
            "max": 128000,
            "step": 256,
            "default": 2048,
            "recommended": 2048,
            "tips": "短文本对话建议 512-1024，公文生成建议 2048-4096，长文档建议 4096+"
        },
        {
            "key": "top_p",
            "label": "Top-P (核采样)",
            "description": "从累积概率达到 P 的最小 Token 集合中采样。与 Temperature 类似控制多样性，通常只需调节其中一个。",
            "type": "float",
            "min": 0,
            "max": 1,
            "step": 0.05,
            "default": 0.9,
            "recommended": 0.9,
            "tips": "建议保持 0.9 不变，优先调节 Temperature"
        },
        {
            "key": "top_k",
            "label": "Top-K (前K采样)",
            "description": "每一步只从概率最高的 K 个 Token 中采样。值越小输出越集中，值越大越多样。",
            "type": "integer",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 50,
            "recommended": 50,
            "tips": "一般保持默认值 50，某些模型不支持此参数"
        },
        {
            "key": "frequency_penalty",
            "label": "频率惩罚 (Frequency Penalty)",
            "description": "对已经出现过的 Token 施加惩罚，减少重复内容。正值减少重复，负值鼓励重复。",
            "type": "float",
            "min": -2,
            "max": 2,
            "step": 0.1,
            "default": 0.0,
            "recommended": 0.0,
            "tips": "出现重复内容时可适当提高到 0.3-0.5"
        },
        {
            "key": "presence_penalty",
            "label": "存在惩罚 (Presence Penalty)",
            "description": "对出现过的 Token 施加固定惩罚，鼓励模型讨论新话题。与频率惩罚类似但不累加。",
            "type": "float",
            "min": -2,
            "max": 2,
            "step": 0.1,
            "default": 0.0,
            "recommended": 0.0,
            "tips": "希望回答更发散时设为 0.3-0.6，精准回答保持 0"
        },
    ])
