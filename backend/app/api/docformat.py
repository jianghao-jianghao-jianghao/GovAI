"""公文格式处理 API 路由

提供端点：
  GET  /presets              - 列出所有可用预设
  GET  /presets/{name}       - 获取预设详细配置
  POST /presets              - 创建自定义预设
  PUT  /presets/{name}       - 更新自定义预设
  DELETE /presets/{name}     - 删除自定义预设
  POST /analyze              - 格式诊断（上传 .docx → 返回分析结果）
  POST /format               - 格式化（上传 .docx → 下载格式化后的 .docx）
  POST /fix-punctuation      - 标点修复（上传 .docx → 下载修复后的 .docx）
  POST /smart-format         - 智能格式化（诊断 + 标点修复 + 格式化 → 下载 .docx + 统计）
  POST /by-doc/{doc_id}/analyze        - 按文档ID诊断
  POST /by-doc/{doc_id}/format         - 按文档ID格式化
  POST /by-doc/{doc_id}/fix-punctuation- 按文档ID标点修复
  POST /by-doc/{doc_id}/smart-format   - 按文档ID智能格式化
  POST /by-doc/{doc_id}/ai-format      - AI智能排版（流式 Markdown 输出）
"""

import os
import json
import shutil
import logging
import tempfile
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, UploadFile, File, Form, Query, Depends, Body
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.response import success, error, ErrorCode
from app.services.docformat.service import DocFormatService
from app.core.database import get_db
from app.core.deps import require_permission
from app.models.document import Document
from app.models.user import User

logger = logging.getLogger('api.docformat')

router = APIRouter(prefix="/docformat", tags=["DocFormat"])

# ==================== 预设 ====================

@router.get("/presets")
async def list_presets(
    current_user: User = Depends(require_permission("app:doc:write")),
):
    """获取所有可用预设列表"""
    presets = DocFormatService.list_presets()
    return success(data=presets)


@router.get("/presets/{preset_name}")
async def get_preset_detail(
    preset_name: str,
    current_user: User = Depends(require_permission("app:doc:write")),
):
    """获取预设详细配置"""
    try:
        detail = DocFormatService.get_preset_detail(preset_name)
        return success(data=detail)
    except ValueError as e:
        return error(ErrorCode.PARAM_INVALID, str(e))


@router.post("/presets")
async def create_preset(
    body: dict,
    current_user: User = Depends(require_permission("app:doc:write")),
):
    """创建自定义格式预设"""
    key = body.pop('key', None)
    if not key:
        return error(ErrorCode.PARAM_INVALID, '缺少预设标识 key')
    try:
        result = DocFormatService.create_preset(key, body)
        return success(data=result, message='预设创建成功')
    except ValueError as e:
        return error(ErrorCode.PARAM_INVALID, str(e))


@router.put("/presets/{preset_name}")
async def update_preset(
    preset_name: str,
    body: dict,
    current_user: User = Depends(require_permission("app:doc:write")),
):
    """更新自定义格式预设"""
    try:
        result = DocFormatService.update_preset(preset_name, body)
        return success(data=result, message='预设更新成功')
    except ValueError as e:
        return error(ErrorCode.PARAM_INVALID, str(e))


@router.delete("/presets/{preset_name}")
async def delete_preset(
    preset_name: str,
    current_user: User = Depends(require_permission("app:doc:write")),
):
    """删除自定义格式预设"""
    try:
        DocFormatService.delete_preset(preset_name)
        return success(message='预设删除成功')
    except ValueError as e:
        return error(ErrorCode.PARAM_INVALID, str(e))


# ==================== 辅助：保存上传文件 ======================================

async def _save_upload(file: UploadFile) -> str:
    """保存上传文件到临时目录，返回路径"""
    if not file.filename or not file.filename.lower().endswith('.docx'):
        raise ValueError('仅支持 .docx 格式文件')

    suffix = Path(file.filename).suffix
    fd, tmp_path = tempfile.mkstemp(suffix=suffix, prefix='docfmt_')
    try:
        content = await file.read()
        with os.fdopen(fd, 'wb') as f:
            f.write(content)
    except Exception:
        os.close(fd)
        raise
    return tmp_path


# ==================== 格式诊断 ====================

@router.post("/analyze")
async def analyze_document(
    file: UploadFile = File(...),
    current_user: User = Depends(require_permission("app:doc:write")),
):
    """格式诊断：上传 .docx，返回分析结果 JSON"""
    try:
        tmp_path = await _save_upload(file)
    except ValueError as e:
        return error(ErrorCode.PARAM_INVALID, str(e))

    try:
        results = DocFormatService.analyze(tmp_path)
        return success(data=results)
    except Exception as e:
        logger.exception("格式诊断失败")
        return error(ErrorCode.INTERNAL_ERROR, f'格式诊断失败: {str(e)}')
    finally:
        DocFormatService.cleanup_temp_file(tmp_path)


# ==================== 格式化 ====================

@router.post("/format")
async def format_document(
    file: UploadFile = File(...),
    preset: str = Form(default='official'),
    custom_preset: str = Form(default=None),
    current_user: User = Depends(require_permission("app:doc:write")),
):
    """格式化文档：上传 .docx → 下载格式化后的 .docx"""
    try:
        tmp_path = await _save_upload(file)
    except ValueError as e:
        return error(ErrorCode.PARAM_INVALID, str(e))

    try:
        custom_dict = None
        if custom_preset:
            try:
                custom_dict = json.loads(custom_preset)
            except json.JSONDecodeError:
                return error(ErrorCode.PARAM_INVALID, '自定义预设 JSON 格式无效')

        output_path, stats = DocFormatService.format(
            tmp_path, preset_name=preset, custom_preset=custom_dict,
        )

        # 构建下载文件名
        original_name = Path(file.filename).stem if file.filename else 'document'
        download_name = f"{original_name}_formatted.docx"

        return FileResponse(
            path=output_path,
            filename=download_name,
            media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            headers={
                'X-Format-Stats': json.dumps(stats, ensure_ascii=False),
                'Access-Control-Expose-Headers': 'X-Format-Stats',
            },
            background=None,  # 让 Starlette 自行清理
        )
    except ValueError as e:
        return error(ErrorCode.PARAM_INVALID, str(e))
    except Exception as e:
        logger.exception("格式化失败")
        return error(ErrorCode.INTERNAL_ERROR, f'格式化失败: {str(e)}')
    finally:
        DocFormatService.cleanup_temp_file(tmp_path)


# ==================== 标点修复 ====================

@router.post("/fix-punctuation")
async def fix_punctuation(
    file: UploadFile = File(...),
    current_user: User = Depends(require_permission("app:doc:write")),
):
    """标点修复：上传 .docx → 下载修复后的 .docx"""
    try:
        tmp_path = await _save_upload(file)
    except ValueError as e:
        return error(ErrorCode.PARAM_INVALID, str(e))

    try:
        output_path, stats = DocFormatService.fix_punctuation(tmp_path)

        original_name = Path(file.filename).stem if file.filename else 'document'
        download_name = f"{original_name}_punct_fixed.docx"

        return FileResponse(
            path=output_path,
            filename=download_name,
            media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            headers={
                'X-Punctuation-Stats': json.dumps(stats, ensure_ascii=False),
                'Access-Control-Expose-Headers': 'X-Punctuation-Stats',
            },
        )
    except Exception as e:
        logger.exception("标点修复失败")
        return error(ErrorCode.INTERNAL_ERROR, f'标点修复失败: {str(e)}')
    finally:
        DocFormatService.cleanup_temp_file(tmp_path)


# ==================== 智能格式化 ====================

@router.post("/smart-format")
async def smart_format(
    file: UploadFile = File(...),
    preset: str = Form(default='official'),
    custom_preset: str = Form(default=None),
    fix_punct: bool = Form(default=True),
    current_user: User = Depends(require_permission("app:doc:write")),
):
    """智能格式化：诊断 + 标点修复 + 格式化，返回处理后的 .docx"""
    try:
        tmp_path = await _save_upload(file)
    except ValueError as e:
        return error(ErrorCode.PARAM_INVALID, str(e))

    try:
        custom_dict = None
        if custom_preset:
            try:
                custom_dict = json.loads(custom_preset)
            except json.JSONDecodeError:
                return error(ErrorCode.PARAM_INVALID, '自定义预设 JSON 格式无效')

        output_path, combined_stats = DocFormatService.smart_format(
            tmp_path,
            preset_name=preset,
            custom_preset=custom_dict,
            fix_punct=fix_punct,
        )

        original_name = Path(file.filename).stem if file.filename else 'document'
        download_name = f"{original_name}_smart_formatted.docx"

        return FileResponse(
            path=output_path,
            filename=download_name,
            media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            headers={
                'X-Smart-Format-Stats': json.dumps(combined_stats, ensure_ascii=False),
                'Access-Control-Expose-Headers': 'X-Smart-Format-Stats',
            },
        )
    except ValueError as e:
        return error(ErrorCode.PARAM_INVALID, str(e))
    except Exception as e:
        logger.exception("智能格式化失败")
        return error(ErrorCode.INTERNAL_ERROR, f'智能格式化失败: {str(e)}')
    finally:
        DocFormatService.cleanup_temp_file(tmp_path)


# ==================== 按文档 ID 操作 ====================

async def _get_doc_source_path(db: AsyncSession, doc_id: UUID) -> tuple:
    """获取文档的源文件路径，返回 (doc, source_path) 或抛异常"""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise ValueError("文档不存在")
    if not doc.source_file_path:
        raise ValueError("该文档无原始文件")
    source_path = Path(doc.source_file_path)
    if not source_path.exists():
        raise ValueError("原始文件已丢失")
    if source_path.suffix.lower() != '.docx':
        raise ValueError(f"仅支持 .docx 文件，当前格式: {source_path.suffix}")
    return doc, source_path


@router.post("/by-doc/{doc_id}/analyze")
async def analyze_by_doc_id(
    doc_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("app:doc:write")),
):
    """按文档 ID 进行格式诊断"""
    try:
        doc, source_path = await _get_doc_source_path(db, doc_id)
        results = DocFormatService.analyze(str(source_path))
        return success(data=results)
    except ValueError as e:
        return error(ErrorCode.PARAM_INVALID, str(e))
    except Exception as e:
        logger.exception("文档ID诊断失败")
        return error(ErrorCode.INTERNAL_ERROR, f'格式诊断失败: {str(e)}')


@router.post("/by-doc/{doc_id}/format")
async def format_by_doc_id(
    doc_id: UUID,
    preset: str = "official",
    custom_preset: dict = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("app:doc:write")),
):
    """按文档 ID 格式化，返回格式化后的文件下载"""
    try:
        doc, source_path = await _get_doc_source_path(db, doc_id)

        output_path, stats = DocFormatService.format(
            str(source_path), preset_name=preset, custom_preset=custom_preset,
        )

        download_name = f"{source_path.stem}_formatted.docx"

        return FileResponse(
            path=output_path,
            filename=download_name,
            media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            headers={
                'X-Format-Stats': json.dumps(stats, ensure_ascii=False),
                'Access-Control-Expose-Headers': 'X-Format-Stats',
            },
        )
    except ValueError as e:
        return error(ErrorCode.PARAM_INVALID, str(e))
    except Exception as e:
        logger.exception("文档ID格式化失败")
        return error(ErrorCode.INTERNAL_ERROR, f'格式化失败: {str(e)}')


@router.post("/by-doc/{doc_id}/fix-punctuation")
async def fix_punctuation_by_doc_id(
    doc_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("app:doc:write")),
):
    """按文档 ID 标点修复，返回修复后的文件下载"""
    try:
        doc, source_path = await _get_doc_source_path(db, doc_id)

        output_path, stats = DocFormatService.fix_punctuation(str(source_path))

        download_name = f"{source_path.stem}_punct_fixed.docx"

        return FileResponse(
            path=output_path,
            filename=download_name,
            media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            headers={
                'X-Punctuation-Stats': json.dumps(stats, ensure_ascii=False),
                'Access-Control-Expose-Headers': 'X-Punctuation-Stats',
            },
        )
    except ValueError as e:
        return error(ErrorCode.PARAM_INVALID, str(e))
    except Exception as e:
        logger.exception("文档ID标点修复失败")
        return error(ErrorCode.INTERNAL_ERROR, f'标点修复失败: {str(e)}')


@router.post("/by-doc/{doc_id}/smart-format")
async def smart_format_by_doc_id(
    doc_id: UUID,
    preset: str = "official",
    custom_preset: dict = None,
    fix_punct: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("app:doc:write")),
):
    """按文档 ID 智能格式化：诊断 + 标点修复 + 格式化，返回处理后的 .docx"""
    try:
        doc, source_path = await _get_doc_source_path(db, doc_id)

        output_path, combined_stats = DocFormatService.smart_format(
            str(source_path),
            preset_name=preset,
            custom_preset=custom_preset,
            fix_punct=fix_punct,
        )

        # 同时保存格式化后的文件到文档目录
        formatted_dir = source_path.parent / "formatted"
        formatted_dir.mkdir(parents=True, exist_ok=True)
        formatted_path = formatted_dir / source_path.name
        shutil.copy2(str(output_path), str(formatted_path))

        download_name = f"{source_path.stem}_smart_formatted.docx"

        return FileResponse(
            path=output_path,
            filename=download_name,
            media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            headers={
                'X-Smart-Format-Stats': json.dumps(combined_stats, ensure_ascii=False),
                'Access-Control-Expose-Headers': 'X-Smart-Format-Stats',
            },
        )
    except ValueError as e:
        return error(ErrorCode.PARAM_INVALID, str(e))
    except Exception as e:
        logger.exception("文档ID智能格式化失败")
        return error(ErrorCode.INTERNAL_ERROR, f'智能格式化失败: {str(e)}')


# ==================== AI 智能排版（流式 Markdown 输出） ====================

@router.post("/by-doc/{doc_id}/ai-format")
async def ai_format_by_doc_id(
    doc_id: UUID,
    doc_type: str = Query(default="official", description="目标文档类型: official/academic/legal"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("app:doc:write")),
):
    """
    AI 智能排版（流式）：调用 Dify 工作流将文档文本转化为结构化 Markdown。

    返回 SSE 流式响应：
      event: text_chunk  → data: {"text": "..."}   增量 Markdown 文本
      event: message_end → data: {}                 结束
      event: error       → data: {"message": "..."} 错误
    """
    try:
        doc, source_path = await _get_doc_source_path(db, doc_id)

        # 读取文档纯文本内容
        doc_text = _extract_docx_text(str(source_path))
        if not doc_text.strip():
            return error(ErrorCode.PARAM_INVALID, "文档内容为空，无法进行 AI 排版分析")

        # 获取 Dify 服务
        from app.services.dify import get_dify_service
        dify = get_dify_service()

        async def event_generator():
            def _sse(event: str, data: dict) -> str:
                return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

            try:
                async for sse_event in dify.run_doc_format_stream(doc_text, doc_type):
                    yield _sse(sse_event.event, sse_event.data)
            except Exception as e:
                logger.exception("AI排版流式生成异常")
                yield _sse("error", {"message": f"AI排版异常: {str(e)}"})

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except ValueError as e:
        return error(ErrorCode.PARAM_INVALID, str(e))
    except RuntimeError as e:
        # Dify Key 未配置
        return error(ErrorCode.INTERNAL_ERROR, str(e))
    except Exception as e:
        logger.exception("AI智能排版失败")
        return error(ErrorCode.INTERNAL_ERROR, f'AI智能排版失败: {str(e)}')


def _extract_docx_text(file_path: str) -> str:
    """从 .docx 文件提取纯文本（段落间以换行分隔）"""
    from docx import Document as DocxDocument
    doc = DocxDocument(file_path)
    paragraphs = []
    for para in doc.paragraphs:
        text = para.text.strip()
        if text:
            paragraphs.append(text)
    return "\n".join(paragraphs)


# ==================== AI 格式诊断（流式 Markdown 输出） ====================

@router.post("/by-doc/{doc_id}/ai-diagnose")
async def ai_diagnose_by_doc_id(
    doc_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("app:doc:write")),
):
    """
    AI 格式诊断（流式）：调用 Dify 工作流分析文档格式问题。

    返回 SSE 流式响应：
      event: text_chunk  → data: {"text": "..."}   增量 Markdown 诊断报告
      event: message_end → data: {}                 结束
      event: error       → data: {"message": "..."} 错误
    """
    try:
        doc, source_path = await _get_doc_source_path(db, doc_id)

        doc_text = _extract_docx_text(str(source_path))
        if not doc_text.strip():
            return error(ErrorCode.PARAM_INVALID, "文档内容为空，无法进行格式诊断")

        from app.services.dify import get_dify_service
        dify = get_dify_service()

        async def event_generator():
            def _sse(event: str, data: dict) -> str:
                return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

            try:
                async for sse_event in dify.run_doc_diagnose_stream(doc_text):
                    yield _sse(sse_event.event, sse_event.data)
            except Exception as e:
                logger.exception("AI格式诊断流式生成异常")
                yield _sse("error", {"message": f"格式诊断异常: {str(e)}"})

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except ValueError as e:
        return error(ErrorCode.PARAM_INVALID, str(e))
    except RuntimeError as e:
        return error(ErrorCode.INTERNAL_ERROR, str(e))
    except Exception as e:
        logger.exception("AI格式诊断失败")
        return error(ErrorCode.INTERNAL_ERROR, f'AI格式诊断失败: {str(e)}')


# ==================== AI 标点修复（流式 Markdown 输出） ====================

@router.post("/by-doc/{doc_id}/ai-punct-fix")
async def ai_punct_fix_by_doc_id(
    doc_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("app:doc:write")),
):
    """
    AI 标点修复（流式）：调用 Dify 工作流修正文档标点符号。

    返回 SSE 流式响应：
      event: text_chunk  → data: {"text": "..."}   增量修正后文本
      event: message_end → data: {}                 结束
      event: error       → data: {"message": "..."} 错误
    """
    try:
        doc, source_path = await _get_doc_source_path(db, doc_id)

        doc_text = _extract_docx_text(str(source_path))
        if not doc_text.strip():
            return error(ErrorCode.PARAM_INVALID, "文档内容为空，无法进行标点修复")

        from app.services.dify import get_dify_service
        dify = get_dify_service()

        async def event_generator():
            def _sse(event: str, data: dict) -> str:
                return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

            try:
                async for sse_event in dify.run_punct_fix_stream(doc_text):
                    yield _sse(sse_event.event, sse_event.data)
            except Exception as e:
                logger.exception("AI标点修复流式生成异常")
                yield _sse("error", {"message": f"标点修复异常: {str(e)}"})

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except ValueError as e:
        return error(ErrorCode.PARAM_INVALID, str(e))
    except RuntimeError as e:
        return error(ErrorCode.INTERNAL_ERROR, str(e))
    except Exception as e:
        logger.exception("AI标点修复失败")
        return error(ErrorCode.INTERNAL_ERROR, f'AI标点修复失败: {str(e)}')
