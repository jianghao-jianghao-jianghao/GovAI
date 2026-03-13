"""格式排版预设 API 路由 — 用户自定义排版预设的 CRUD"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.response import success, error, ErrorCode
from app.models.format_preset import FormatPreset
from app.models.user import User
from app.schemas.format_preset import FormatPresetCreate, FormatPresetUpdate, FormatPresetOut

logger = logging.getLogger("api.format_presets")

router = APIRouter(prefix="/format-presets", tags=["FormatPresets"])


@router.get("")
async def list_presets(
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """获取当前用户的所有自定义排版预设"""
    result = await db.execute(
        select(FormatPreset)
        .where(FormatPreset.user_id == current_user.id)
        .order_by(FormatPreset.created_at.asc())
    )
    presets = result.scalars().all()
    return success(data=[FormatPresetOut.model_validate(p).model_dump(mode="json") for p in presets])


@router.post("")
async def create_preset(
    body: FormatPresetCreate,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """创建自定义排版预设"""
    preset = FormatPreset(
        name=body.name,
        category=body.category,
        description=body.description,
        instruction=body.instruction,
        system_prompt=body.system_prompt,
        user_id=current_user.id,
    )
    db.add(preset)
    await db.flush()
    await db.refresh(preset)
    return success(
        data=FormatPresetOut.model_validate(preset).model_dump(mode="json"),
        message="预设已创建",
    )


@router.put("/{preset_id}")
async def update_preset(
    preset_id: UUID,
    body: FormatPresetUpdate,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """更新自定义排版预设（仅限所有者）"""
    result = await db.execute(
        select(FormatPreset).where(
            FormatPreset.id == preset_id,
            FormatPreset.user_id == current_user.id,
        )
    )
    preset = result.scalar_one_or_none()
    if not preset:
        return error(ErrorCode.NOT_FOUND, "预设不存在或无权修改")

    update_data = body.model_dump(exclude_unset=True)
    if update_data:
        for k, v in update_data.items():
            setattr(preset, k, v)
        await db.flush()
        await db.refresh(preset)

    return success(
        data=FormatPresetOut.model_validate(preset).model_dump(mode="json"),
        message="预设已更新",
    )


@router.delete("/{preset_id}")
async def delete_preset(
    preset_id: UUID,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """删除自定义排版预设（仅限所有者）"""
    result = await db.execute(
        select(FormatPreset).where(
            FormatPreset.id == preset_id,
            FormatPreset.user_id == current_user.id,
        )
    )
    preset = result.scalar_one_or_none()
    if not preset:
        return error(ErrorCode.NOT_FOUND, "预设不存在或无权删除")

    await db.delete(preset)
    return success(message="预设已删除")
