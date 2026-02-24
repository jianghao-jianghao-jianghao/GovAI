"""
Dify 真实服务实现。
当 DIFY_MOCK=full 时使用，全部走真实 Dify API。

已实现的功能：
- 知识库管理：create_dataset, delete_dataset, upload_document, delete_document, get_indexing_status
- Workflow：run_doc_draft, run_doc_check, run_doc_optimize
- Chat：chat_stream (SSE 流式)
- 实体抽取：extract_entities
"""

import asyncio
import json
import logging
import re
from typing import AsyncGenerator, Optional

import httpx

from app.core.config import settings
from app.services.dify.base import (
    DifyServiceBase,
    WorkflowResult,
    ReviewItem,
    ReviewResult,
    SSEEvent,
    DatasetInfo,
    DocumentUploadResult,
    EntityTriple,
    DifyDatasetItem,
    DifyDocumentItem,
    StructuredParagraph,
)

logger = logging.getLogger(__name__)


class RealDifyService(DifyServiceBase):
    """
    真实 Dify API 客户端。
    通过 HTTP 调用 Dify 平台的 Dataset / Workflow / Chat API。
    """

    # ── 重试配置 ──
    MAX_RETRIES = 3
    RETRY_DELAY = 1.0  # 秒（指数退避基数）

    def __init__(self):
        self.base_url = settings.DIFY_BASE_URL
        self.dataset_api_key = settings.DIFY_DATASET_API_KEY
        self.doc_draft_key = settings.DIFY_APP_DOC_DRAFT_KEY
        self.doc_check_key = settings.DIFY_APP_DOC_CHECK_KEY
        self.doc_optimize_key = settings.DIFY_APP_DOC_OPTIMIZE_KEY
        self.qa_chat_key = settings.DIFY_APP_CHAT_KEY
        self.entity_extract_key = settings.DIFY_APP_ENTITY_EXTRACT_KEY
        self.doc_format_key = settings.DIFY_APP_DOC_FORMAT_KEY
        self.doc_diagnose_key = settings.DIFY_APP_DOC_DIAGNOSE_KEY
        self.punct_fix_key = settings.DIFY_APP_PUNCT_FIX_KEY
        # 连接超时 5 秒（HybridService 会 fallback，无需等太久）
        # 读取超时 120 秒（Workflow 响应可能较慢）
        self.timeout = httpx.Timeout(timeout=120.0, connect=5.0)

    # ══════════════════════════════════════════════════════════
    # 通用请求方法（带重试、错误处理）
    # ══════════════════════════════════════════════════════════

    async def _request(
        self,
        method: str,
        url: str,
        *,
        api_key: str,
        json_body: Optional[dict] = None,
        files: Optional[dict] = None,
        data: Optional[dict] = None,
        params: Optional[dict] = None,
    ) -> httpx.Response:
        """带重试的 HTTP 请求"""
        headers = {"Authorization": f"Bearer {api_key}"}
        if json_body is not None and files is None:
            headers["Content-Type"] = "application/json"

        for attempt in range(self.MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.request(
                        method, url, headers=headers,
                        json=json_body, files=files, data=data, params=params,
                    )

                if resp.status_code < 400:
                    return resp

                # 429 频率限制 → 退避重试
                if resp.status_code == 429 and attempt < self.MAX_RETRIES - 1:
                    retry_after = int(resp.headers.get("Retry-After", 30))
                    logger.warning(f"Dify rate limited, retry after {retry_after}s")
                    await asyncio.sleep(retry_after)
                    continue

                # 5xx 服务器错误 → 退避重试
                if resp.status_code >= 500 and attempt < self.MAX_RETRIES - 1:
                    delay = self.RETRY_DELAY * (2 ** attempt)
                    logger.warning(f"Dify server error {resp.status_code}, retrying in {delay}s")
                    await asyncio.sleep(delay)
                    continue

                # 其余错误直接抛出
                self._raise_for_status(resp)

            except httpx.TimeoutException:
                # 超时（特别是 ReadTimeout）通常是 LLM 推理耗时过长
                # 重试没有意义，直接抛出让 Hybrid 降级到 Mock
                raise Exception(f"Dify 请求超时 (url={url})")
            except httpx.ConnectError as e:
                # 连接失败（Dify 不可达）→ 不重试，直接抛出让 Hybrid 降级
                raise Exception(f"Dify 连接失败: {e}")
            except httpx.RequestError as e:
                if attempt < self.MAX_RETRIES - 1:
                    await asyncio.sleep(self.RETRY_DELAY * (2 ** attempt))
                    continue
                raise Exception(f"Dify 连接失败: {e}")

        raise Exception("Dify 请求重试次数超限")

    @staticmethod
    def _raise_for_status(resp: httpx.Response):
        """解析 Dify 错误并抛出异常"""
        try:
            body = resp.json()
            message = body.get("message", resp.text)
        except Exception:
            message = resp.text
        raise Exception(f"Dify API 错误 ({resp.status_code}): {message}")

    async def _run_chatflow_blocking(
        self,
        *,
        api_key: str,
        query: str,
        inputs: dict,
        user: str = "govai-system",
    ) -> dict:
        """
        执行 Dify Chatflow（对话型工作流）streaming 模式，
        收集所有 SSE 事件后返回完整结果。

        注意：Dify 1.13+ 即使设置 response_mode=blocking，也会返回
        Content-Type: text/event-stream，导致 httpx.aread() 永远挂起。
        因此改为 streaming 模式 + 逐事件读取，等 message_end 后返回。
        """
        url = f"{self.base_url}/chat-messages"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "query": query,
            "inputs": inputs,
            "response_mode": "streaming",
            "user": user,
        }

        accumulated_text = ""
        conversation_id = ""
        message_id = ""
        metadata: dict = {}

        # 使用更长的读超时（5 分钟），避免复杂工作流超时
        stream_timeout = httpx.Timeout(timeout=300.0, connect=10.0)

        try:
            async with httpx.AsyncClient(timeout=stream_timeout) as client:
                async with client.stream(
                    "POST", url, headers=headers, json=body,
                ) as resp:
                    if resp.status_code >= 400:
                        body_bytes = await resp.aread()
                        try:
                            err = json.loads(body_bytes)
                            msg = err.get("message", body_bytes.decode())
                        except Exception:
                            msg = body_bytes.decode()
                        raise Exception(f"Dify API 错误 ({resp.status_code}): {msg}")

                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        payload = line[6:].strip()
                        if not payload:
                            continue
                        try:
                            evt = json.loads(payload)
                        except json.JSONDecodeError:
                            continue

                        event_type = evt.get("event", "")

                        if event_type == "message":
                            # Chatflow 的增量文本事件
                            accumulated_text += evt.get("answer", "")
                            if not conversation_id:
                                conversation_id = evt.get("conversation_id", "")
                            if not message_id:
                                message_id = evt.get("message_id", "")

                        elif event_type == "message_end":
                            metadata = evt.get("metadata", {})
                            if not conversation_id:
                                conversation_id = evt.get("conversation_id", "")
                            if not message_id:
                                message_id = evt.get("message_id", "")
                            break  # 收到结束事件，退出

                        elif event_type == "error":
                            err_msg = evt.get("message", str(evt))
                            raise Exception(f"Dify Chatflow 错误: {err_msg}")

        except httpx.TimeoutException:
            raise Exception(f"Dify 请求超时 (url={url})")
        except httpx.ConnectError as e:
            raise Exception(f"Dify 连接失败: {e}")

        if not accumulated_text:
            logger.warning(f"Chatflow 未返回有效文本，conversation_id={conversation_id}")

        return {
            "text": accumulated_text,
            "conversation_id": conversation_id,
            "message_id": message_id,
            "metadata": metadata,
        }

    # ══════════════════════════════════════════════════════════
    # 辅助：上传文件到 Dify（多模态支持）
    # ══════════════════════════════════════════════════════════

    async def _upload_file_to_dify(
        self,
        *,
        api_key: str,
        file_bytes: bytes,
        file_name: str,
        user: str = "govai-system",
    ) -> str:
        """
        上传文件到 Dify /files/upload 接口，返回 upload_file_id。
        后续在 chat-messages 中通过 files 参数引用此 ID。
        """
        url = f"{self.base_url}/files/upload"
        # 推断 MIME 类型
        ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "bin"
        mime_map = {
            "pdf": "application/pdf",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "doc": "application/msword",
            "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "xls": "application/vnd.ms-excel",
            "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "csv": "text/csv",
            "txt": "text/plain",
            "md": "text/markdown",
            "html": "text/html",
            "htm": "text/html",
            "json": "application/json",
            "xml": "application/xml",
            "png": "image/png",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
        }
        content_type = mime_map.get(ext, "application/octet-stream")

        files = {"file": (file_name, file_bytes, content_type)}
        data = {"user": user}

        resp = await self._request(
            "POST", url, api_key=api_key, files=files, data=data,
        )
        result = resp.json()
        upload_file_id = result.get("id", "")
        if not upload_file_id:
            raise Exception(f"Dify 文件上传失败，响应: {result}")
        logger.info(f"文件上传到 Dify 成功: {file_name} -> {upload_file_id}")
        return upload_file_id

    # ══════════════════════════════════════════════════════════
    # 辅助：从 LLM 输出解析结构化段落
    # ══════════════════════════════════════════════════════════

    VALID_STYLE_TYPES = {
        "title", "recipient", "heading1", "heading2", "heading3", "heading4",
        "body", "closing", "signature", "date", "attachment",
    }

    # ── 字号标准化映射 ──
    # AI 可能输出: "1号" "一号" "一号字" "初号字体" "16pt" 等各种变体
    VALID_FONT_SIZES = {
        "初号", "小初", "一号", "小一", "二号", "小二",
        "三号", "小三", "四号", "小四", "五号", "小五",
    }
    _FONT_SIZE_ALIAS: dict[str, str] = {
        # 阿拉伯数字 → 中文
        "1号": "一号", "2号": "二号", "3号": "三号", "4号": "四号", "5号": "五号",
        "小1": "小一", "小2": "小二", "小3": "小三", "小4": "小四", "小5": "小五",
        # 带"字"/"字号"/"号字体"后缀
        "初号字": "初号", "小初字": "小初",
        "一号字": "一号", "二号字": "二号", "三号字": "三号", "四号字": "四号", "五号字": "五号",
        "小一字": "小一", "小二字": "小二", "小三字": "小三", "小四字": "小四", "小五字": "小五",
        "初号字号": "初号", "小初字号": "小初",
        "一号字号": "一号", "二号字号": "二号", "三号字号": "三号", "四号字号": "四号", "五号字号": "五号",
        "小一字号": "小一", "小二字号": "小二", "小三字号": "小三", "小四字号": "小四", "小五字号": "小五",
        # 带空格
        "小 初": "小初", "小 一": "小一", "小 二": "小二", "小 三": "小三", "小 四": "小四", "小 五": "小五",
    }

    # ── 字体标准化映射 ──
    VALID_FONT_FAMILIES = {
        "方正小标宋简体", "黑体", "楷体_GB2312", "仿宋_GB2312", "宋体", "微软雅黑",
    }
    _FONT_FAMILY_ALIAS: dict[str, str] = {
        # 方正小标宋变体
        "方正小标宋": "方正小标宋简体", "小标宋": "方正小标宋简体", "小标宋简体": "方正小标宋简体",
        "fzxiaobiaosong": "方正小标宋简体", "fzxbs": "方正小标宋简体",
        # 黑体变体
        "simhei": "黑体", "heiti": "黑体", "stheiti": "黑体",
        # 楷体变体
        "楷体": "楷体_GB2312", "kaiti": "楷体_GB2312", "楷体gb2312": "楷体_GB2312",
        "stkaiti": "楷体_GB2312", "华文楷体": "楷体_GB2312", "kai": "楷体_GB2312",
        # 仿宋变体
        "仿宋": "仿宋_GB2312", "fangsong": "仿宋_GB2312", "仿宋gb2312": "仿宋_GB2312",
        "stfangsong": "仿宋_GB2312", "华文仿宋": "仿宋_GB2312", "仿宋体": "仿宋_GB2312",
        # 宋体变体
        "simsun": "宋体", "songti": "宋体", "stsong": "宋体",
        "华文宋体": "宋体", "华文中宋": "宋体", "宋体_gb2312": "宋体",
        # 微软雅黑变体
        "雅黑": "微软雅黑", "yahei": "微软雅黑", "microsoft yahei": "微软雅黑",
        "msyh": "微软雅黑",
    }

    # ── style_type 模糊匹配 ──
    _STYLE_TYPE_ALIAS: dict[str, str] = {
        "标题": "title", "题目": "title", "文件标题": "title",
        "主送": "recipient", "主送机关": "recipient", "收文单位": "recipient",
        "一级标题": "heading1", "一级": "heading1",
        "二级标题": "heading2", "二级": "heading2",
        "三级标题": "heading3", "三级": "heading3",
        "四级标题": "heading4", "四级": "heading4",
        "正文": "body", "内容": "body", "段落": "body",
        "结束语": "closing", "结束": "closing", "结尾": "closing",
        "落款": "signature", "署名": "signature", "发文机关": "signature",
        "日期": "date", "成文日期": "date",
        "附件": "attachment", "附": "attachment",
        # 英文变体
        "heading_1": "heading1", "heading_2": "heading2",
        "heading_3": "heading3", "heading_4": "heading4",
        "h1": "heading1", "h2": "heading2", "h3": "heading3", "h4": "heading4",
    }

    # ── 对齐方式标准化 ──
    VALID_ALIGNMENTS = {"left", "center", "right", "justify"}
    _ALIGNMENT_ALIAS: dict[str, str] = {
        "居中": "center", "居左": "left", "居右": "right",
        "两端对齐": "justify", "两端": "justify",
        "左对齐": "left", "右对齐": "right", "中间": "center",
    }

    # ── 颜色名称映射 ──
    _COLOR_NAME_MAP: dict[str, str] = {
        "黑色": "#000000", "红色": "#CC0000", "深灰": "#333333", "灰色": "#666666",
        "蓝色": "#0033CC", "绿色": "#006600", "紫色": "#800080",
        "black": "#000000", "red": "#CC0000", "blue": "#0033CC",
        "green": "#006600", "purple": "#800080", "gray": "#666666", "grey": "#666666",
        "dark gray": "#333333", "dark grey": "#333333",
    }

    @classmethod
    def _normalize_font_size(cls, raw) -> str | None:
        """标准化字号：阿拉伯数字→中文、去后缀、模糊匹配"""
        if raw is None:
            return None
        s = str(raw).strip()
        if not s:
            return None
        # 精确命中
        if s in cls.VALID_FONT_SIZES:
            return s
        # 别名映射
        mapped = cls._FONT_SIZE_ALIAS.get(s)
        if mapped:
            return mapped
        # 去掉常见后缀再查
        for suffix in ("字号", "字体", "号字", "字", "号"):
            if s.endswith(suffix):
                core = s[: -len(suffix)]
                if core in cls.VALID_FONT_SIZES:
                    return core
                if core in cls._FONT_SIZE_ALIAS:
                    return cls._FONT_SIZE_ALIAS[core]
        logger.debug(f"字号标准化失败，使用 None: {raw!r}")
        return None

    @classmethod
    def _normalize_font_family(cls, raw) -> str | None:
        """标准化字体：别名映射、大小写容错"""
        if raw is None:
            return None
        s = str(raw).strip()
        if not s:
            return None
        # 精确命中
        if s in cls.VALID_FONT_FAMILIES:
            return s
        # 别名映射（忽略大小写）
        mapped = cls._FONT_FAMILY_ALIAS.get(s.lower())
        if mapped:
            return mapped
        # 尝试去掉空格和下划线再匹配
        normalized = s.lower().replace(" ", "").replace("_", "")
        for alias, canonical in cls._FONT_FAMILY_ALIAS.items():
            if alias.replace(" ", "").replace("_", "") == normalized:
                return canonical
        logger.debug(f"字体标准化失败，使用 None: {raw!r}")
        return None

    @classmethod
    def _normalize_style_type(cls, raw) -> str:
        """标准化段落类型：支持中文名、英文变体、模糊匹配"""
        if not raw:
            return "body"
        s = str(raw).strip()
        # 精确命中
        if s in cls.VALID_STYLE_TYPES:
            return s
        # 忽略大小写命中
        lower = s.lower()
        if lower in cls.VALID_STYLE_TYPES:
            return lower
        # 别名映射
        mapped = cls._STYLE_TYPE_ALIAS.get(lower) or cls._STYLE_TYPE_ALIAS.get(s)
        if mapped:
            return mapped
        # 正则模糊匹配
        if re.search(r"heading\s*1", lower):
            return "heading1"
        if re.search(r"heading\s*2", lower):
            return "heading2"
        if re.search(r"heading\s*3", lower):
            return "heading3"
        if re.search(r"heading\s*4", lower):
            return "heading4"
        logger.debug(f"style_type 标准化降级为 body: {raw!r}")
        return "body"

    @classmethod
    def _normalize_alignment(cls, raw) -> str | None:
        """标准化对齐方式"""
        if not raw:
            return None
        s = str(raw).strip().lower()
        if s in cls.VALID_ALIGNMENTS:
            return s
        return cls._ALIGNMENT_ALIAS.get(s)

    def _normalize_paragraph_fields(self, p: dict) -> StructuredParagraph | None:
        """统一标准化一个段落字典 → StructuredParagraph（带完整容错）"""
        text = str(p.get("text", "")).strip()
        if not text:
            return None
        style_type = self._normalize_style_type(p.get("style_type"))
        font_size = self._normalize_font_size(p.get("font_size"))
        font_family = self._normalize_font_family(p.get("font_family"))
        bold = p.get("bold") if isinstance(p.get("bold"), bool) else None
        italic = p.get("italic") if isinstance(p.get("italic"), bool) else None
        color = self._normalize_color(p.get("color"))
        indent = p.get("indent") if isinstance(p.get("indent"), str) else None
        alignment = self._normalize_alignment(p.get("alignment"))
        line_height = p.get("line_height") if isinstance(p.get("line_height"), str) else None
        red_line = p.get("red_line") if isinstance(p.get("red_line"), bool) else None
        _idx = p.get("_index") if isinstance(p.get("_index"), int) else None
        return StructuredParagraph(
            text=text, style_type=style_type,
            font_size=font_size, font_family=font_family,
            bold=bold, italic=italic, color=color, indent=indent,
            alignment=alignment, line_height=line_height,
            red_line=red_line, _index=_idx,
        )

    @staticmethod
    def _clean_llm_json(raw: str) -> str:
        """清洗 LLM 输出，提取 JSON 文本"""
        # 剥离 <think>...</think>
        clean = re.sub(r"<think>[\s\S]*?</think>", "", raw).strip()
        if not clean:
            return ""
        # 剥离 markdown 代码块
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", clean)
        if m:
            clean = m.group(1).strip()
        # 找第一个 { 到最后一个 }
        if not clean.startswith("{"):
            s = clean.find("{")
            e = clean.rfind("}")
            if s != -1 and e > s:
                clean = clean[s:e + 1]
        return clean

    def _parse_structured_paragraphs(self, raw_text: str) -> list[StructuredParagraph]:
        """
        从 LLM 输出的 JSON 文本中解析结构化段落列表。

        期望格式:
        {
          "paragraphs": [
            {"text": "...", "style_type": "title"},
            ...
          ],
          ...
        }
        """
        clean = self._clean_llm_json(raw_text)
        if not clean:
            return []

        try:
            # 尝试使用 json_repair 以增强容错
            try:
                from json_repair import loads as jr_loads
                data = jr_loads(clean)
            except ImportError:
                data = json.loads(clean)
        except (json.JSONDecodeError, Exception) as e:
            logger.warning(f"结构化段落 JSON 解析失败: {e}, 原文前 300 字符: {clean[:300]}")
            return []

        if not isinstance(data, dict):
            return []

        raw_paragraphs = data.get("paragraphs", [])
        if not isinstance(raw_paragraphs, list):
            return []

        result: list[StructuredParagraph] = []
        for p in raw_paragraphs:
            if not isinstance(p, dict):
                continue
            para = self._normalize_paragraph_fields(p)
            if para:
                result.append(para)

        return result

    def _try_parse_incremental_paragraphs(
        self, accumulated: str, already_sent: int
    ) -> list[StructuredParagraph]:
        """
        增量解析：从不断增长的 LLM 输出文本中，找到已完成的段落对象。
        只返回 `already_sent` 之后新完成的段落。
        """
        # 找 "paragraphs" 数组的起始
        idx = accumulated.find('"paragraphs"')
        if idx == -1:
            return []
        arr_start = accumulated.find("[", idx)
        if arr_start == -1:
            return []

        # 逐字符扫描，找到完整的 {...} 对象
        paragraphs: list[StructuredParagraph] = []
        i = arr_start + 1
        depth = 0
        obj_start = -1
        in_string = False
        escape_next = False

        while i < len(accumulated):
            c = accumulated[i]
            if escape_next:
                escape_next = False
                i += 1
                continue
            if c == "\\":
                if in_string:
                    escape_next = True
                i += 1
                continue
            if c == '"':
                in_string = not in_string
                i += 1
                continue
            if in_string:
                i += 1
                continue
            # 不在字符串内
            if c == "{" and depth == 0:
                obj_start = i
                depth = 1
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0 and obj_start >= 0:
                    obj_str = accumulated[obj_start : i + 1]
                    try:
                        obj = json.loads(obj_str)
                        para = self._normalize_paragraph_fields(obj)
                        if para:
                            paragraphs.append(para)
                    except (json.JSONDecodeError, Exception):
                        pass
                    obj_start = -1
            elif c == "]" and depth == 0:
                break  # 数组结束
            i += 1

        # 只返回新段落
        return paragraphs[already_sent:]

    # ══════════════════════════════════════════════════════════
    # Knowledge Base (Dataset) — 知识库管理
    # ══════════════════════════════════════════════════════════

    async def create_dataset(self, name: str) -> DatasetInfo:
        url = f"{self.base_url}/datasets"
        payload = {
            "name": name,
            "description": "",
            "permission": "only_me",
            "indexing_technique": "high_quality",
        }
        resp = await self._request("POST", url, api_key=self.dataset_api_key, json_body=payload)
        result = resp.json()
        return DatasetInfo(dataset_id=result.get("id", ""), name=result.get("name", name))

    async def delete_dataset(self, dataset_id: str) -> None:
        url = f"{self.base_url}/datasets/{dataset_id}"
        await self._request("DELETE", url, api_key=self.dataset_api_key)

    async def upload_document(
        self, dataset_id: str, file_name: str, file_content: bytes, file_type: str
    ) -> DocumentUploadResult:
        url = f"{self.base_url}/datasets/{dataset_id}/document/create-by-file"
        files = {"file": (file_name, file_content, file_type)}
        data = {
            "data": json.dumps({
                "indexing_technique": "high_quality",
                "process_rule": {"mode": "automatic"},
            })
        }
        resp = await self._request("POST", url, api_key=self.dataset_api_key, files=files, data=data)
        result = resp.json()
        document = result.get("document", {})
        return DocumentUploadResult(
            document_id=document.get("id", ""),
            batch_id=result.get("batch", ""),
        )

    async def delete_document(self, dataset_id: str, document_id: str) -> None:
        url = f"{self.base_url}/datasets/{dataset_id}/documents/{document_id}"
        await self._request("DELETE", url, api_key=self.dataset_api_key)

    async def get_indexing_status(self, dataset_id: str, batch_id: str) -> str:
        url = f"{self.base_url}/datasets/{dataset_id}/documents/{batch_id}/indexing-status"
        resp = await self._request("GET", url, api_key=self.dataset_api_key)
        result = resp.json()
        data_list = result.get("data", [])
        if data_list:
            return data_list[0].get("indexing_status", "error")
        return "error"

    async def list_datasets(self) -> list[DifyDatasetItem]:
        """列出 Dify 上所有 Dataset（分页全量获取）"""
        all_datasets: list[DifyDatasetItem] = []
        page = 1
        limit = 100
        while True:
            url = f"{self.base_url}/datasets"
            resp = await self._request(
                "GET", url, api_key=self.dataset_api_key,
                params={"page": page, "limit": limit},
            )
            result = resp.json()
            data_list = result.get("data", [])
            for ds in data_list:
                all_datasets.append(DifyDatasetItem(
                    dataset_id=ds.get("id", ""),
                    name=ds.get("name", ""),
                    document_count=ds.get("document_count", 0),
                ))
            if not result.get("has_more", False) and len(data_list) < limit:
                break
            page += 1
        return all_datasets

    async def list_dataset_documents(self, dataset_id: str) -> list[DifyDocumentItem]:
        """列出 Dify Dataset 下所有文档（分页全量获取）"""
        all_docs: list[DifyDocumentItem] = []
        page = 1
        limit = 100
        while True:
            url = f"{self.base_url}/datasets/{dataset_id}/documents"
            resp = await self._request(
                "GET", url, api_key=self.dataset_api_key,
                params={"page": page, "limit": limit},
            )
            result = resp.json()
            data_list = result.get("data", [])
            for doc in data_list:
                all_docs.append(DifyDocumentItem(
                    document_id=doc.get("id", ""),
                    name=doc.get("name", ""),
                    indexing_status=doc.get("indexing_status", ""),
                ))
            if not result.get("has_more", False) and len(data_list) < limit:
                break
            page += 1
        return all_docs

    # ══════════════════════════════════════════════════════════
    # Workflow — 公文起草 / 审查 / 优化
    # ══════════════════════════════════════════════════════════

    async def run_doc_draft(
        self,
        title: str,
        outline: str,
        doc_type: str,
        template_content: str = "",
        kb_texts: str = "",
    ) -> WorkflowResult:
        """
        公文起草 Chatflow — 返回纯文本公文内容（不含格式信息）。

        起草阶段只关注内容，LLM 直接输出公文全文纯文本。
        """
        query = f"请帮我起草一份{doc_type}，标题是：{title}\n\n大纲：\n{outline}"

        inputs = {}
        if template_content:
            inputs["template_content"] = template_content
        if kb_texts:
            inputs["reference_materials"] = kb_texts

        outputs = await self._run_chatflow_blocking(
            api_key=self.doc_draft_key,
            query=query,
            inputs=inputs,
        )

        answer_text = outputs.get("text", "")

        return WorkflowResult(
            output_text=answer_text,
            metadata=outputs.get("metadata", {}),
            paragraphs=[],
        )

    async def run_doc_draft_stream(
        self,
        title: str,
        outline: str,
        doc_type: str,
        template_content: str = "",
        kb_texts: str = "",
        user_instruction: str = "",
        file_bytes: bytes | None = None,
        file_name: str = "",
    ) -> AsyncGenerator[SSEEvent, None]:
        """
        公文起草 Chatflow — 流式版本（多模态，纯文本输出）。

        起草阶段只关注内容，不关注格式排版。
        LLM 直接输出公文纯文本，后端以 text_chunk 事件逐片推送，
        前端 markdownToHtml() 根据文本编号规则自动渲染样式。

        Yields:
          SSEEvent(event="text_chunk", data={"text": "..."})            — 增量文本片段
          SSEEvent(event="progress",   data={"message": "...", ...})    — 进度心跳
          SSEEvent(event="message_end", data={"full_text": "..."})      — 完成
        """
        # ── 构建 query ──
        # 注意：始终将已提取的文档文本内容放入 query，
        # 因为多模态 VL 模型只能“看”图片，无法直接解析 DOCX/PDF 等文档文件。
        if user_instruction and user_instruction.strip():
            query = user_instruction.strip()
            if title:
                query = f"[文档标题]: {title}\n\n[起草要求]: {query}"
            if outline:
                query += f"\n\n[参考文档内容]:\n{outline[:8000]}"
        else:
            query = f"请帮我起草一份{doc_type}，标题是：{title}"
            if outline:
                query += f"\n\n[参考文档内容]:\n{outline[:8000]}"

        if file_bytes:
            query += f"\n\n（同时已上传原始文件：{file_name}）"

        inputs: dict = {}
        if template_content:
            inputs["template_content"] = template_content
        if kb_texts:
            inputs["reference_materials"] = kb_texts

        # ── 上传文件到 Dify（多模态直传） ──
        files_payload: list[dict] = []
        if file_bytes and file_name:
            try:
                upload_file_id = await self._upload_file_to_dify(
                    api_key=self.doc_draft_key,
                    file_bytes=file_bytes,
                    file_name=file_name,
                    user="govai-doc-draft",
                )
                ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
                image_exts = {"png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"}
                file_type = "image" if ext in image_exts else "document"
                files_payload.append({
                    "type": file_type,
                    "transfer_method": "local_file",
                    "upload_file_id": upload_file_id,
                })
            except Exception as e:
                logger.warning(f"文件上传到 Dify 失败，降级为纯文本模式: {e}")
                if outline:
                    query += f"\n\n[文件内容（文本提取）]:\n{outline[:8000]}"

        url = f"{self.base_url}/chat-messages"
        headers = {"Authorization": f"Bearer {self.doc_draft_key}"}
        body: dict = {
            "query": query,
            "inputs": inputs,
            "response_mode": "streaming",
            "user": "govai-doc-draft",
        }
        if files_payload:
            body["files"] = files_payload

        stream_timeout = httpx.Timeout(connect=10.0, read=600.0, write=10.0, pool=10.0)
        inside_think = False
        accumulated = ""
        chunk_count = 0

        try:
            async with httpx.AsyncClient(timeout=stream_timeout) as client:
                async with client.stream("POST", url, headers=headers, json=body) as resp:
                    if resp.status_code >= 400:
                        error_body = ""
                        async for chunk in resp.aiter_text():
                            error_body += chunk
                        yield SSEEvent(event="error", data={"message": f"Dify API 错误 ({resp.status_code}): {error_body}"})
                        return

                    async for line in resp.aiter_lines():
                        line = line.strip()
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            event_data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

                        event_type = event_data.get("event", "")
                        if event_type == "message":
                            text = event_data.get("answer", "")
                            if not text:
                                continue

                            # 过滤 <think>...</think>
                            if "<think>" in text:
                                inside_think = True
                                before = text.split("<think>")[0]
                                if before:
                                    accumulated += before
                                    yield SSEEvent(event="text_chunk", data={"text": before})
                                continue
                            if "</think>" in text:
                                inside_think = False
                                after = text.split("</think>")[-1]
                                if after:
                                    accumulated += after
                                    yield SSEEvent(event="text_chunk", data={"text": after})
                                continue
                            if inside_think:
                                continue

                            accumulated += text
                            chunk_count += 1

                            # 直接推送纯文本片段
                            yield SSEEvent(event="text_chunk", data={"text": text})

                            # 定期发送进度心跳
                            if chunk_count % 50 == 0:
                                yield SSEEvent(
                                    event="progress",
                                    data={"message": f"AI 正在生成中… ({len(accumulated)} 字符)", "chars": len(accumulated)},
                                )

                        elif event_type in ("message_end", "workflow_finished"):
                            break
                        elif event_type == "error":
                            yield SSEEvent(event="error", data={"message": event_data.get("message", "Dify 工作流错误")})
                            return

            yield SSEEvent(event="message_end", data={"full_text": accumulated})

        except Exception as e:
            logger.exception("公文起草流式调用失败")
            yield SSEEvent(event="error", data={"message": f"公文起草失败: {str(e)}"})

    async def run_doc_check(self, content: str) -> ReviewResult:
        """
        公文审查 Chatflow。

        Chatflow 输入:
          - query: 待审查的公文内容
          - inputs: 空（或根据 Chatflow 设计传入额外参数）
        Chatflow 输出:
          - answer: 审查结果（JSON 格式字符串或纯文本）
        
        注意：Chatflow 的输出格式取决于你在 Dify 中的设计。
        如果 Chatflow 返回 JSON，需要解析；如果返回纯文本，需要适配。
        """
        query = f"请审查以下公文，检查错别字、语法问题和敏感词：\n\n{content}"
        
        outputs = await self._run_chatflow_blocking(
            api_key=self.doc_check_key,
            query=query,
            inputs={},
        )
        
        result = ReviewResult()
        answer_text = outputs.get("text", "")
        
        # 尝试解析 JSON 格式的审查结果
        try:
            review_data = json.loads(answer_text)
            
            # 解析 typos
            raw_typos = review_data.get("typos", [])
            if isinstance(raw_typos, str):
                raw_typos = json.loads(raw_typos)
            for item in raw_typos:
                result.typos.append(ReviewItem(
                    text=item.get("original", item.get("text", "")),
                    suggestion=item.get("suggestion", ""),
                    context=item.get("position", item.get("reason", "")),
                ))
            
            # 解析 grammar
            raw_grammar = review_data.get("grammar_issues", [])
            if isinstance(raw_grammar, str):
                raw_grammar = json.loads(raw_grammar)
            for item in raw_grammar:
                result.grammar.append(ReviewItem(
                    text=item.get("text", ""),
                    suggestion=item.get("suggestion", ""),
                    context=item.get("position", ""),
                ))
            
            # 解析 sensitive
            raw_sensitive = review_data.get("sensitive_words", [])
            if isinstance(raw_sensitive, str):
                raw_sensitive = json.loads(raw_sensitive)
            for item in raw_sensitive:
                result.sensitive.append(ReviewItem(
                    text=item.get("word", item.get("text", "")),
                    suggestion=item.get("suggestion", ""),
                    context=item.get("position", ""),
                ))
        except json.JSONDecodeError:
            # 如果不是 JSON 格式，将整个文本作为审查结果
            logger.warning(f"公文审查返回非 JSON 格式: {answer_text[:100]}")
            # 可以在这里添加文本解析逻辑，或者返回空结果
            pass
        
        return result

    async def run_doc_optimize(self, content: str, kb_texts: str = "") -> WorkflowResult:
        """
        公文优化 Chatflow — 返回结构化段落。

        Chatflow 输出 JSON：
        {
          "paragraphs": [ {"text": "...", "style_type": "title"}, ... ],
          "changes": [...],
          "advice_to_user": [...]
        }
        """
        query = f"请优化以下公文，提升语言规范性：\n\n{content}"

        inputs = {}
        if kb_texts:
            inputs["reference_materials"] = kb_texts

        outputs = await self._run_chatflow_blocking(
            api_key=self.doc_optimize_key,
            query=query,
            inputs=inputs,
        )

        answer_text = outputs.get("text", "")
        paragraphs = self._parse_structured_paragraphs(answer_text)

        if paragraphs:
            plain_text = "\n\n".join(p.text for p in paragraphs)
        else:
            plain_text = answer_text
            logger.warning("公文优化未返回结构化段落，降级为纯文本")

        return WorkflowResult(
            output_text=plain_text,
            metadata=outputs.get("metadata", {}),
            paragraphs=paragraphs,
        )

    # ══════════════════════════════════════════════════════════
    # 公文审查与优化（合并版，流式） — 返回结构化建议
    # ══════════════════════════════════════════════════════════

    @staticmethod
    def _try_parse_incremental_suggestions(
        accumulated: str, already_sent: int
    ) -> list[dict]:
        """
        增量解析 JSON 流中的 suggestion 对象。

        LLM 输出格式为 {"suggestions": [{...}, {...}, ...], "summary": "..."}
        当检测到 suggestions 数组中有新完成的对象时，返回尚未发送的部分。
        """
        # 寻找 "suggestions" 数组的开始
        arr_start = accumulated.find('"suggestions"')
        if arr_start < 0:
            return []
        bracket_pos = accumulated.find("[", arr_start)
        if bracket_pos < 0:
            return []

        # 尝试解析从 [ 开始的部分，逐个提取完整对象
        suggestions: list[dict] = []
        depth = 0
        obj_start = -1
        i = bracket_pos
        while i < len(accumulated):
            ch = accumulated[i]
            if ch == "{":
                if depth == 0:
                    obj_start = i
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0 and obj_start >= 0:
                    obj_str = accumulated[obj_start : i + 1]
                    try:
                        obj = json.loads(obj_str)
                        suggestions.append({
                            "category": obj.get("category", "grammar"),
                            "severity": obj.get("severity", "warning"),
                            "original": obj.get("original", ""),
                            "suggestion": obj.get("suggestion", ""),
                            "reason": obj.get("reason", ""),
                            "context": obj.get("context", ""),
                        })
                    except json.JSONDecodeError:
                        pass
                    obj_start = -1
            elif ch == "]" and depth == 0:
                break  # 数组结束
            # 跳过 JSON 字符串内的 { } 字符
            elif ch == '"' and depth > 0:
                i += 1
                while i < len(accumulated):
                    if accumulated[i] == "\\":
                        i += 2
                        continue
                    if accumulated[i] == '"':
                        break
                    i += 1
            i += 1

        # 只返回新增的（还未发送过的）
        if len(suggestions) > already_sent:
            return suggestions[already_sent:]
        return []

    async def run_doc_review_stream(
        self,
        content: str,
        user_instruction: str = "",
        file_bytes: bytes | None = None,
        file_name: str = "",
    ) -> AsyncGenerator[SSEEvent, None]:
        """
        公文审查与优化 Chatflow（流式） — 支持文件上传 + 文档提取器。

        流程：
        1. 若有源文件 → 上传到 Dify，由 Dify 文档提取器解析
        2. 流式接收 LLM 输出的 JSON
        3. 每检测到一个完整的 suggestion 对象 → 立即推送 review_suggestion 事件
        4. 最终推送 review_result 汇总事件
        """
        url = f"{self.base_url}/chat-messages"

        # ── 构建 query ──
        query_parts = []
        if user_instruction:
            query_parts.append(f"[用户特别要求]: {user_instruction}\n\n")
        query_parts.append("请对以下公文进行全面审查与优化：\n\n")
        query_parts.append(content[:12000])  # 限制内容长度

        if file_bytes:
            query_parts.append(f"\n\n（同时已上传原始文件：{file_name}，请结合文件内容一并审查）")

        # ── 上传文件到 Dify（文档提取器直传） ──
        files_payload: list[dict] = []
        if file_bytes and file_name:
            try:
                upload_file_id = await self._upload_file_to_dify(
                    api_key=self.doc_optimize_key,
                    file_bytes=file_bytes,
                    file_name=file_name,
                    user="govai-review",
                )
                ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
                files_payload.append({
                    "type": "document",
                    "transfer_method": "local_file",
                    "upload_file_id": upload_file_id,
                })
                logger.info(f"审查优化：文件已上传到 Dify -> {upload_file_id}")
            except Exception as e:
                logger.warning(f"审查优化：文件上传失败，降级为纯文本模式: {e}")

        body: dict = {
            "inputs": {},
            "query": "".join(query_parts),
            "response_mode": "streaming",
            "user": "govai-review",
        }
        if files_payload:
            body["files"] = files_payload

        stream_timeout = httpx.Timeout(timeout=300.0, connect=10.0)
        headers = {"Authorization": f"Bearer {self.doc_optimize_key}"}

        accumulated = ""
        inside_think = False
        chunk_count = 0
        already_sent_count = 0  # 已推送到前端的 suggestion 数量

        try:
            async with httpx.AsyncClient(timeout=stream_timeout) as client:
                async with client.stream("POST", url, headers=headers, json=body) as resp:
                    if resp.status_code >= 400:
                        error_body = ""
                        async for chunk in resp.aiter_text():
                            error_body += chunk
                        yield SSEEvent(event="error", data={"message": f"Dify API 错误 ({resp.status_code}): {error_body}"})
                        return

                    async for line in resp.aiter_lines():
                        line = line.strip()
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            event_data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

                        event_type = event_data.get("event", "")
                        if event_type == "message":
                            text = event_data.get("answer", "")
                            if not text:
                                continue

                            # 过滤 <think>...</think>
                            if "<think>" in text:
                                inside_think = True
                                before = text.split("<think>")[0]
                                if before:
                                    accumulated += before
                                continue
                            if "</think>" in text:
                                inside_think = False
                                after = text.split("</think>")[-1]
                                if after:
                                    accumulated += after
                                continue
                            if inside_think:
                                continue

                            accumulated += text
                            chunk_count += 1

                            # 尝试增量解析：检测已完成的 suggestion 对象
                            # 使用括号计数来判断完整 JSON 对象
                            newly_parsed = self._try_parse_incremental_suggestions(
                                accumulated, already_sent_count
                            )
                            if newly_parsed:
                                for s in newly_parsed:
                                    already_sent_count += 1
                                    yield SSEEvent(
                                        event="review_suggestion",
                                        data={"index": already_sent_count - 1, **s},
                                    )

                            # 每隔 30 个 chunk 发送进度心跳
                            if chunk_count % 30 == 0:
                                yield SSEEvent(
                                    event="progress",
                                    data={"message": f"AI 正在审查分析中… ({len(accumulated)} 字符)"},
                                )

                        elif event_type in ("message_end", "workflow_finished"):
                            break
                        elif event_type == "error":
                            yield SSEEvent(event="error", data={"message": event_data.get("message", "Dify 审查优化错误")})
                            return

            # 最终解析完整 JSON — 提取 summary + 兜底未推送的 suggestions
            suggestions = []
            summary = ""
            try:
                json_text = accumulated.strip()
                if json_text.startswith("```"):
                    json_text = re.sub(r'^```(?:json)?\s*', '', json_text)
                    json_text = re.sub(r'\s*```\s*$', '', json_text)

                review_data = json.loads(json_text)
                summary = review_data.get("summary", "")

                for item in review_data.get("suggestions", []):
                    suggestions.append({
                        "category": item.get("category", "grammar"),
                        "severity": item.get("severity", "warning"),
                        "original": item.get("original", ""),
                        "suggestion": item.get("suggestion", ""),
                        "reason": item.get("reason", ""),
                        "context": item.get("context", ""),
                    })

                # 推送增量阶段可能遗漏的尾部 suggestions
                if len(suggestions) > already_sent_count:
                    for s in suggestions[already_sent_count:]:
                        yield SSEEvent(
                            event="review_suggestion",
                            data={"index": already_sent_count, **s},
                        )
                        already_sent_count += 1

            except json.JSONDecodeError:
                logger.warning(f"审查优化返回非 JSON 格式: {accumulated[:200]}")
                summary = "审查结果解析失败，请重试"

            yield SSEEvent(
                event="review_result",
                data={"suggestions": suggestions, "summary": summary},
            )

        except Exception as e:
            logger.exception("公文审查优化流式调用失败")
            yield SSEEvent(event="error", data={"message": f"审查优化失败: {str(e)}"})

    # ══════════════════════════════════════════════════════════
    # Chat — 智能问答 (工作流编排对话型应用 SSE 流式)
    # ══════════════════════════════════════════════════════════

    async def chat_stream(
        self,
        query: str,
        user_id: str,
        conversation_id: Optional[str] = None,
        dataset_ids: Optional[list[str]] = None,
        kb_context: str = "",
        graph_context: str = "",
        kb_top_score: float = 0.0,
    ) -> AsyncGenerator[SSEEvent, None]:
        """
        调用 Dify 工作流编排对话型应用 (Chatflow) 的 SSE 流式接口。
        
        后端检索版：将已检索的 kb_context / graph_context 作为 inputs 传入 Dify 工作流，
        Dify 仅做 LLM 推理（不做内部知识库检索）。
        """
        url = f"{self.base_url}/chat-messages"
        headers = {"Authorization": f"Bearer {self.qa_chat_key}"}
        
        # 构建 inputs — 传递后端检索结果给 Dify 工作流
        inputs: dict = {}
        if kb_context:
            inputs["kb_context"] = kb_context[:20000]   # Dify 变量上限
        if graph_context:
            inputs["graph_context"] = graph_context[:10000]
        if kb_top_score > 0:
            inputs["kb_top_score"] = round(kb_top_score, 4)
        
        body: dict = {
            "inputs": inputs,
            "query": query,
            "response_mode": "streaming",
            "user": user_id,
        }
        if conversation_id:
            body["conversation_id"] = conversation_id

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream("POST", url, headers=headers, json=body) as resp:
                    if resp.status_code >= 400:
                        error_body = ""
                        async for chunk in resp.aiter_text():
                            error_body += chunk
                        raise Exception(f"Dify Chat API 错误 ({resp.status_code}): {error_body}")

                    message_start_sent = False
                    workflow_data = {}  # 收集 workflow 级别的元数据

                    async for line in resp.aiter_lines():
                        line = line.strip()
                        if not line:
                            continue
                        if not line.startswith("data:"):
                            continue

                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break

                        try:
                            event_data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

                        event_type = event_data.get("event", "")

                        if event_type == "message":
                            # Dify Chatflow: 增量文本在 answer 字段
                            yield SSEEvent(
                                event="text_chunk",
                                data={"text": event_data.get("answer", "")},
                            )
                            # 首次获取 conversation_id 时发送 message_start（仅一次）
                            if not message_start_sent:
                                conv_id = event_data.get("conversation_id")
                                msg_id = event_data.get("message_id")
                                if conv_id and msg_id:
                                    yield SSEEvent(
                                        event="message_start",
                                        data={
                                            "message_id": msg_id,
                                            "conversation_id": conv_id,
                                        },
                                    )
                                    message_start_sent = True

                        elif event_type == "message_end":
                            # 消息结束：提取检索引用 + 用量统计
                            metadata = event_data.get("metadata", {})
                            retriever_resources = metadata.get("retriever_resources", [])
                            usage = metadata.get("usage", {})
                            token_count = usage.get("total_tokens", 0)

                            # 构建 citations 事件
                            if retriever_resources:
                                citations = []
                                for res in retriever_resources:
                                    citations.append({
                                        "title": res.get("document_name", ""),
                                        "type": "kb",
                                        "page": res.get("position"),
                                        "quote": res.get("content", "")[:200],
                                        "score": res.get("score"),
                                        "dataset_name": res.get("dataset_name", ""),
                                    })
                                yield SSEEvent(event="citations", data={"citations": citations})

                            yield SSEEvent(
                                event="message_end",
                                data={
                                    "message_id": event_data.get("message_id", ""),
                                    "conversation_id": event_data.get("conversation_id", ""),
                                    "token_count": token_count,
                                    "usage": usage,
                                },
                            )

                        elif event_type == "workflow_started":
                            # 工作流开始执行
                            workflow_data["workflow_run_id"] = event_data.get("workflow_run_id", "")
                            workflow_data["task_id"] = event_data.get("task_id", "")
                            yield SSEEvent(
                                event="workflow_started",
                                data={
                                    "workflow_run_id": event_data.get("workflow_run_id", ""),
                                    "task_id": event_data.get("task_id", ""),
                                },
                            )

                        elif event_type == "node_started":
                            # 节点开始（可用于前端展示推理过程）
                            node_data = event_data.get("data", {})
                            yield SSEEvent(
                                event="node_started",
                                data={
                                    "node_id": node_data.get("node_id", ""),
                                    "node_type": node_data.get("node_type", ""),
                                    "title": node_data.get("title", ""),
                                },
                            )

                        elif event_type == "node_finished":
                            # 节点完成（含输出，可抽取 reasoning / knowledge_graph）
                            node_data = event_data.get("data", {})
                            node_type = node_data.get("node_type", "")
                            outputs = node_data.get("outputs", {}) or {}

                            # 如果节点输出含 reasoning，发送推理事件
                            reasoning_text = outputs.get("reasoning") or outputs.get("thought") or ""
                            if reasoning_text:
                                yield SSEEvent(
                                    event="reasoning",
                                    data={"text": reasoning_text},
                                )

                            # 如果节点输出含知识图谱数据，发送知识图谱事件
                            kg_data = outputs.get("knowledge_graph") or outputs.get("entities")
                            if kg_data:
                                yield SSEEvent(
                                    event="knowledge_graph",
                                    data={"triples": kg_data if isinstance(kg_data, list) else []},
                                )

                            # 透传 node_finished 事件（前端可用于构建推理链）
                            yield SSEEvent(
                                event="node_finished",
                                data={
                                    "node_id": node_data.get("node_id", ""),
                                    "node_type": node_type,
                                    "title": node_data.get("title", ""),
                                    "status": node_data.get("status", ""),
                                    "elapsed_time": node_data.get("elapsed_time", 0),
                                },
                            )

                        elif event_type == "workflow_finished":
                            # 工作流完成
                            wf_data = event_data.get("data", {})
                            yield SSEEvent(
                                event="workflow_finished",
                                data={
                                    "workflow_run_id": wf_data.get("id", ""),
                                    "status": wf_data.get("status", ""),
                                    "total_tokens": wf_data.get("total_tokens", 0),
                                    "elapsed_time": wf_data.get("elapsed_time", 0),
                                },
                            )

                        elif event_type == "message_replace":
                            # 内容审查替换
                            yield SSEEvent(
                                event="message_replace",
                                data={"text": event_data.get("answer", "")},
                            )

                        elif event_type == "error":
                            yield SSEEvent(
                                event="error",
                                data={
                                    "code": event_data.get("code", ""),
                                    "message": event_data.get("message", "未知错误"),
                                },
                            )

                        elif event_type in ("ping", "tts_message", "tts_message_end"):
                            continue  # 心跳/TTS 事件忽略

        except Exception as e:
            logger.error(f"Dify Chat SSE 异常: {e}")
            yield SSEEvent(event="error", data={"code": "stream_error", "message": str(e)})

    # ══════════════════════════════════════════════════════════
    # Entity Extraction — 知识图谱实体抽取
    # ══════════════════════════════════════════════════════════

    async def extract_entities(self, text: str) -> list[EntityTriple]:
        """
        调用 Dify 实体抽取 Chatflow（纯文本输入，不上传文件）。

        使用 streaming 模式收集完整响应，避免 blocking 模式的 120 秒超时。

        流程：
          1. 将 Markdown 文本作为 query 直接传给 Chatflow
          2. 以 streaming 模式接收 SSE 事件，拼接所有 answer 片段
          3. 解析最终 JSON → EntityTriple 列表

        Dify 结构化输出格式:
          {
            "query": "...",
            "entities": [{"id": "entity_1", "name": "...", "type": "...", ...}],
            "relations": [{"id": "rel_1", "source": "entity_1", "relation_type": "...", "target": "entity_2", ...}]
          }
        注意: relations 中 source/target 是实体 ID（如 entity_1），不是实体名称。
        """
        url = f"{self.base_url}/chat-messages"
        headers = {"Authorization": f"Bearer {self.entity_extract_key}"}
        body = {
            "query": text,
            "inputs": {},
            "response_mode": "streaming",
            "user": "govai-entity-extract",
        }

        # 使用 streaming 模式收集完整 answer，带重试（防止瞬时连接断开）
        stream_timeout = httpx.Timeout(connect=10.0, read=300.0, write=10.0, pool=10.0)
        max_retries = 3
        last_error: Exception | None = None

        for attempt in range(1, max_retries + 1):
            answer_parts: list[str] = []
            try:
                async with httpx.AsyncClient(timeout=stream_timeout) as client:
                    async with client.stream("POST", url, headers=headers, json=body) as resp:
                        if resp.status_code >= 400:
                            error_body = ""
                            async for chunk in resp.aiter_text():
                                error_body += chunk
                            raise Exception(f"Dify API 错误 ({resp.status_code}): {error_body}")

                        async for line in resp.aiter_lines():
                            line = line.strip()
                            if not line or not line.startswith("data:"):
                                continue
                            data_str = line[5:].strip()
                            if data_str == "[DONE]":
                                break
                            try:
                                event_data = json.loads(data_str)
                            except json.JSONDecodeError:
                                continue

                            event_type = event_data.get("event", "")
                            if event_type == "message":
                                answer_parts.append(event_data.get("answer", ""))
                            elif event_type in ("message_end", "workflow_finished"):
                                break
                            elif event_type == "error":
                                raise Exception(f"Dify 工作流错误: {event_data.get('message', data_str)}")

                # 成功，跳出重试循环
                last_error = None
                break

            except Exception as e:
                last_error = e
                if attempt < max_retries:
                    wait = self.RETRY_DELAY * (2 ** (attempt - 1))
                    logger.warning(f"实体抽取第 {attempt} 次失败: {e}，{wait}s 后重试...")
                    await asyncio.sleep(wait)
                else:
                    logger.error(f"实体抽取第 {attempt} 次失败（已用尽重试）: {e}")

        if last_error is not None:
            if isinstance(last_error, httpx.ConnectError):
                raise Exception(f"Dify 连接失败 (重试 {max_retries} 次): {last_error}")
            elif isinstance(last_error, httpx.TimeoutException):
                raise Exception(f"Dify 实体抽取超时 (重试 {max_retries} 次, url={url})")
            else:
                raise Exception(f"Dify 实体抽取失败 (重试 {max_retries} 次): {last_error}")

        answer_text = "".join(answer_parts)
        if not answer_text.strip():
            logger.warning("实体抽取返回空内容")
            return []

        logger.debug(f"实体抽取原始响应 ({len(answer_text)} 字符): {answer_text[:300]}")

        # ── 预处理：剥离 LLM 的 <think>...</think> 推理标签 ──
        import re
        clean_text = re.sub(r"<think>[\s\S]*?</think>", "", answer_text).strip()
        if not clean_text:
            logger.warning("实体抽取响应仅含 <think> 标签，无实际内容")
            return []

        # 尝试从文本中提取 JSON 块（可能被 markdown 代码块包裹）
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", clean_text)
        if json_match:
            clean_text = json_match.group(1).strip()

        # 如果仍不是以 { 开头，尝试找第一个 { 到最后一个 }
        if not clean_text.startswith("{"):
            brace_start = clean_text.find("{")
            brace_end = clean_text.rfind("}")
            if brace_start != -1 and brace_end > brace_start:
                clean_text = clean_text[brace_start:brace_end + 1]

        logger.debug(f"清洗后文本 ({len(clean_text)} 字符): {clean_text[:300]}")

        # 解析 JSON 结构化输出
        triples: list[EntityTriple] = []
        try:
            extraction_data = json.loads(clean_text)

            # 解析实体列表，构建 ID→实体 映射
            raw_entities = extraction_data.get("entities", [])
            if isinstance(raw_entities, str):
                raw_entities = json.loads(raw_entities)

            entity_by_id: dict[str, dict] = {}
            for ent in raw_entities:
                ent_id = ent.get("id", "")
                if ent_id:
                    entity_by_id[ent_id] = ent

            # 也做一份 name→type 映射（兼容旧格式 source/target 直接写名称的情况）
            entity_type_by_name: dict[str, str] = {}
            for ent in raw_entities:
                entity_type_by_name[ent.get("name", "")] = ent.get("type", "未知")

            # 解析关系列表（字段名 "relations"，兼容 "relationships"）
            raw_rels = extraction_data.get("relations") or extraction_data.get("relationships", [])
            if isinstance(raw_rels, str):
                raw_rels = json.loads(raw_rels)

            for rel in raw_rels:
                src_ref = rel.get("source", "")
                tgt_ref = rel.get("target", "")
                relation = rel.get("relation_type") or rel.get("relation", "相关")

                # source/target 可能是实体 ID（entity_1）或实体名称
                src_ent = entity_by_id.get(src_ref)
                tgt_ent = entity_by_id.get(tgt_ref)

                if src_ent and tgt_ent:
                    # 标准模式：通过 ID 查找
                    source_name = src_ent.get("name", src_ref)
                    target_name = tgt_ent.get("name", tgt_ref)
                    source_type = src_ent.get("type", "未知")
                    target_type = tgt_ent.get("type", "未知")
                else:
                    # 兼容模式：source/target 直接是名称
                    source_name = src_ref
                    target_name = tgt_ref
                    source_type = entity_type_by_name.get(src_ref, "未知")
                    target_type = entity_type_by_name.get(tgt_ref, "未知")

                if source_name and target_name:
                    triples.append(EntityTriple(
                        source=source_name,
                        target=target_name,
                        relation=relation,
                        source_type=source_type,
                        target_type=target_type,
                    ))

            logger.info(
                f"实体抽取完成: {len(raw_entities)} 个实体, "
                f"{len(raw_rels)} 个关系 → {len(triples)} 个三元组"
            )
        except json.JSONDecodeError:
            logger.warning(f"实体抽取返回非 JSON 格式: {clean_text[:300]}")

        return triples

    # ══════════════════════════════════════════════════════════
    # Document Format — AI 智能排版（支持文件上传 + 增量流式）
    # ══════════════════════════════════════════════════════════

    # 允许的颜色白名单（防止 LLM 输出不规范颜色）
    VALID_COLORS = {
        "#000000", "#CC0000", "#333333", "#666666",
        "#0033CC", "#006600", "#800080",
    }

    @classmethod
    def _normalize_color(cls, raw) -> str | None:
        """归一化颜色值：支持中英文颜色名、hex格式验证、白名单映射"""
        if not raw:
            return None
        s = str(raw).strip()
        if not s:
            return None
        # 先查颜色名映射
        mapped = cls._COLOR_NAME_MAP.get(s.lower()) or cls._COLOR_NAME_MAP.get(s)
        if mapped:
            return mapped
        # hex 格式处理
        c = s.upper()
        if not c.startswith("#"):
            c = "#" + c
        # 验证格式 #RRGGBB
        if re.match(r"^#[0-9A-F]{6}$", c):
            # 在白名单中直接通过
            if c in cls.VALID_COLORS:
                return c
            # 不在白名单中也放行（前端可渲染），但记录日志
            logger.debug(f"颜色值 {c} 不在白名单内，放行")
            return c
        logger.debug(f"颜色标准化失败: {raw!r}")
        return None

    def _paragraph_to_event_data(self, p: StructuredParagraph) -> dict:
        """将 StructuredParagraph 转换为 SSE event data dict"""
        event_data = {"text": p.text, "style_type": p.style_type}
        for attr in ("font_size", "font_family", "bold", "italic", "color", "indent", "alignment", "line_height", "red_line", "_index"):
            val = getattr(p, attr, None)
            if val is not None:
                event_data[attr] = val
        return event_data

    async def run_doc_format_stream(
        self,
        content: str,
        doc_type: str = "official",
        user_instruction: str = "",
        file_bytes: bytes | None = None,
        file_name: str = "",
    ) -> AsyncGenerator[SSEEvent, None]:
        """
        调用 Dify 智能文档排版 Chatflow（支持文件上传 + 增量流式段落推送）。

        新版工作流: start → document-extractor → LLM(qwen-plus, json_object) → answer
        - 当有 file_bytes 时，先上传文件到 Dify，通过 files 参数传入 document-extractor
        - 流式收集 LLM 输出，增量解析完成的段落对象并实时推送到前端
        - 最终做完整解析作为兜底

        Yields:
          SSEEvent(event="progress",              data={"message": "..."})
          SSEEvent(event="structured_paragraph",   data={"text": "...", "style_type": "...", "color": "...", ...})
          SSEEvent(event="text_chunk",             data={"text": "..."})  — 降级
          SSEEvent(event="message_end",            data={"full_text": "..."})
        """
        type_hint = {
            "official": "公文",
            "academic": "学术论文",
            "legal": "法律文书",
        }.get(doc_type, "公文")

        # 构建排版指令
        if user_instruction and user_instruction.strip():
            if content and content.strip():
                query = f"[排版指令]: {user_instruction.strip()}\n\n[文档原文]:\n{content}"
            else:
                query = f"[排版指令]: {user_instruction.strip()}"
        else:
            query = f"请将以下{type_hint}文本进行结构分析和排版：\n\n{content}"

        # ── 文件上传（可选） ──
        upload_file_id = None
        if file_bytes and file_name:
            try:
                upload_file_id = await self._upload_file_to_dify(
                    api_key=self.doc_format_key,
                    file_bytes=file_bytes,
                    file_name=file_name,
                    user="govai-doc-format",
                )
                logger.info(f"排版文件上传成功: {file_name} -> {upload_file_id}")
                # 如果有文件，query 不需要嵌入全文（document-extractor 会提取）
                if user_instruction and user_instruction.strip():
                    query = f"[排版指令]: {user_instruction.strip()}"
                else:
                    query = f"请按{type_hint}标准对上传的文档进行结构分析和排版"
            except Exception as e:
                logger.warning(f"排版文件上传失败，降级为纯文本模式: {e}")

        url = f"{self.base_url}/chat-messages"
        headers = {"Authorization": f"Bearer {self.doc_format_key}"}
        body: dict = {
            "query": query,
            "inputs": {},
            "response_mode": "streaming",
            "user": "govai-doc-format",
        }
        if upload_file_id:
            body["files"] = [
                {"type": "document", "transfer_method": "local_file", "upload_file_id": upload_file_id}
            ]

        stream_timeout = httpx.Timeout(connect=10.0, read=300.0, write=10.0, pool=10.0)
        inside_think = False
        answer_parts: list[str] = []
        already_sent = 0
        chunk_count = 0

        try:
            yield SSEEvent(event="progress", data={"message": "正在分析文档结构…"})

            async with httpx.AsyncClient(timeout=stream_timeout) as client:
                async with client.stream("POST", url, headers=headers, json=body) as resp:
                    if resp.status_code >= 400:
                        error_body = ""
                        async for chunk in resp.aiter_text():
                            error_body += chunk
                        yield SSEEvent(event="error", data={"message": f"Dify API 错误 ({resp.status_code}): {error_body}"})
                        return

                    async for line in resp.aiter_lines():
                        line = line.strip()
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            event_data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

                        event_type = event_data.get("event", "")
                        if event_type == "message":
                            text = event_data.get("answer", "")
                            if not text:
                                continue

                            # 过滤 <think>...</think> 标签
                            if "<think>" in text:
                                inside_think = True
                                before = text.split("<think>")[0]
                                if before:
                                    answer_parts.append(before)
                                continue
                            if "</think>" in text:
                                inside_think = False
                                after = text.split("</think>")[-1]
                                if after:
                                    answer_parts.append(after)
                                continue
                            if inside_think:
                                continue

                            answer_parts.append(text)
                            chunk_count += 1

                            # 每 15 个 chunk 尝试增量解析段落
                            if chunk_count % 15 == 0:
                                accumulated = "".join(answer_parts)
                                new_paragraphs = self._try_parse_incremental_paragraphs(accumulated, already_sent)
                                for p in new_paragraphs:
                                    yield SSEEvent(
                                        event="structured_paragraph",
                                        data=self._paragraph_to_event_data(p),
                                    )
                                    already_sent += 1

                            # 进度心跳
                            if chunk_count % 30 == 0:
                                char_count = sum(len(p) for p in answer_parts)
                                yield SSEEvent(event="progress", data={
                                    "message": f"AI 正在排版分析中… ({char_count} 字符)"
                                })

                        elif event_type in ("message_end", "workflow_finished"):
                            break

                        elif event_type == "error":
                            yield SSEEvent(event="error", data={"message": event_data.get("message", "Dify 工作流错误")})
                            return

            # 收集完毕，做完整解析（兜底）
            full_answer = "".join(answer_parts)
            all_paragraphs = self._parse_structured_paragraphs(full_answer)

            if all_paragraphs:
                # 只发送增量解析未覆盖的剩余段落
                remaining = all_paragraphs[already_sent:]
                for p in remaining:
                    yield SSEEvent(
                        event="structured_paragraph",
                        data=self._paragraph_to_event_data(p),
                    )
                total_sent = already_sent + len(remaining)
                logger.info(f"AI排版完成: 共 {total_sent} 段 (增量 {already_sent} + 兜底 {len(remaining)})")
            elif already_sent == 0:
                # 增量也没解析出来，降级为纯文本
                logger.warning("AI排版未返回有效结构化 JSON，降级为纯文本")
                yield SSEEvent(event="text_chunk", data={"text": full_answer})

            yield SSEEvent(event="message_end", data={"full_text": full_answer})

        except Exception as e:
            logger.exception("AI排版流式调用失败")
            yield SSEEvent(event="error", data={"message": f"AI排版失败: {str(e)}"})

    # ══════════════════════════════════════════════════════════
    # Document Diagnose — AI 格式诊断
    # ══════════════════════════════════════════════════════════

    async def run_doc_diagnose_stream(self, content: str) -> AsyncGenerator[SSEEvent, None]:
        """
        调用 Dify 智能格式诊断 Chatflow（流式）。

        AI 分析文档的格式问题，输出 Markdown 格式的诊断报告。

        Yields:
          SSEEvent(event="text_chunk", data={"text": "..."})  — 增量文本
          SSEEvent(event="message_end", data={})               — 结束
        """
        query = f"请诊断以下公文的格式问题，输出诊断报告：\n\n{content}"

        url = f"{self.base_url}/chat-messages"
        headers = {"Authorization": f"Bearer {self.doc_diagnose_key}"}
        body = {
            "query": query,
            "inputs": {},
            "response_mode": "streaming",
            "user": "govai-doc-diagnose",
        }

        stream_timeout = httpx.Timeout(connect=10.0, read=300.0, write=10.0, pool=10.0)
        inside_think = False

        try:
            async with httpx.AsyncClient(timeout=stream_timeout) as client:
                async with client.stream("POST", url, headers=headers, json=body) as resp:
                    if resp.status_code >= 400:
                        error_body = ""
                        async for chunk in resp.aiter_text():
                            error_body += chunk
                        yield SSEEvent(event="error", data={"message": f"Dify API 错误 ({resp.status_code}): {error_body}"})
                        return

                    async for line in resp.aiter_lines():
                        line = line.strip()
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            event_data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

                        event_type = event_data.get("event", "")
                        if event_type == "message":
                            text = event_data.get("answer", "")
                            if not text:
                                continue
                            if "<think>" in text:
                                inside_think = True
                                before = text.split("<think>")[0]
                                if before:
                                    yield SSEEvent(event="text_chunk", data={"text": before})
                                continue
                            if "</think>" in text:
                                inside_think = False
                                after = text.split("</think>")[-1]
                                if after:
                                    yield SSEEvent(event="text_chunk", data={"text": after})
                                continue
                            if inside_think:
                                continue
                            yield SSEEvent(event="text_chunk", data={"text": text})
                        elif event_type in ("message_end", "workflow_finished"):
                            yield SSEEvent(event="message_end", data={})
                            return
                        elif event_type == "error":
                            yield SSEEvent(event="error", data={"message": event_data.get("message", "Dify 诊断错误")})
                            return

            yield SSEEvent(event="message_end", data={})

        except Exception as e:
            logger.exception("AI格式诊断流式调用失败")
            yield SSEEvent(event="error", data={"message": f"格式诊断失败: {str(e)}"})

    # ══════════════════════════════════════════════════════════
    # Punctuation Fix — AI 标点修复
    # ══════════════════════════════════════════════════════════

    async def run_punct_fix_stream(self, content: str) -> AsyncGenerator[SSEEvent, None]:
        """
        调用 Dify 智能标点修复 Chatflow（流式）。

        AI 修正文档中的标点符号问题，输出修正后的完整文本。

        Yields:
          SSEEvent(event="text_chunk", data={"text": "..."})  — 增量文本
          SSEEvent(event="message_end", data={})               — 结束
        """
        query = f"请修复以下文档中的标点符号问题，输出修正后的完整文本：\n\n{content}"

        url = f"{self.base_url}/chat-messages"
        headers = {"Authorization": f"Bearer {self.punct_fix_key}"}
        body = {
            "query": query,
            "inputs": {},
            "response_mode": "streaming",
            "user": "govai-punct-fix",
        }

        stream_timeout = httpx.Timeout(connect=10.0, read=300.0, write=10.0, pool=10.0)
        inside_think = False

        try:
            async with httpx.AsyncClient(timeout=stream_timeout) as client:
                async with client.stream("POST", url, headers=headers, json=body) as resp:
                    if resp.status_code >= 400:
                        error_body = ""
                        async for chunk in resp.aiter_text():
                            error_body += chunk
                        yield SSEEvent(event="error", data={"message": f"Dify API 错误 ({resp.status_code}): {error_body}"})
                        return

                    async for line in resp.aiter_lines():
                        line = line.strip()
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            event_data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

                        event_type = event_data.get("event", "")
                        if event_type == "message":
                            text = event_data.get("answer", "")
                            if not text:
                                continue
                            if "<think>" in text:
                                inside_think = True
                                before = text.split("<think>")[0]
                                if before:
                                    yield SSEEvent(event="text_chunk", data={"text": before})
                                continue
                            if "</think>" in text:
                                inside_think = False
                                after = text.split("</think>")[-1]
                                if after:
                                    yield SSEEvent(event="text_chunk", data={"text": after})
                                continue
                            if inside_think:
                                continue
                            yield SSEEvent(event="text_chunk", data={"text": text})
                        elif event_type in ("message_end", "workflow_finished"):
                            yield SSEEvent(event="message_end", data={})
                            return
                        elif event_type == "error":
                            yield SSEEvent(event="error", data={"message": event_data.get("message", "Dify 标点修复错误")})
                            return

            yield SSEEvent(event="message_end", data={})

        except Exception as e:
            logger.exception("AI标点修复流式调用失败")
            yield SSEEvent(event="error", data={"message": f"标点修复失败: {str(e)}"})
