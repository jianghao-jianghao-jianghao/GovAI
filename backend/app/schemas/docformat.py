"""公文格式处理 — Pydantic 数据模型"""

from typing import Optional
from pydantic import BaseModel, Field


# ==================== 请求模型 ====================

class FormatRequest(BaseModel):
    """格式化请求（multipart form data 中的非文件字段）"""
    preset: str = Field(default='official', description='预设名: official/academic/legal/custom')
    custom_preset: Optional[dict] = Field(default=None, description='自定义预设配置（preset=custom 时使用）')


class SmartFormatRequest(BaseModel):
    """智能格式化请求"""
    preset: str = Field(default='official')
    custom_preset: Optional[dict] = None
    fix_punctuation: bool = Field(default=True, description='是否同时修复标点')


# ==================== 响应模型 ====================

class PresetInfo(BaseModel):
    key: str
    name: str
    description: str


class PresetListResponse(BaseModel):
    presets: list[PresetInfo]


class PresetDetailResponse(BaseModel):
    key: str
    name: str = ''
    page: Optional[dict] = None
    title: Optional[dict] = None
    recipient: Optional[dict] = None
    heading1: Optional[dict] = None
    heading2: Optional[dict] = None
    heading3: Optional[dict] = None
    heading4: Optional[dict] = None
    body: Optional[dict] = None
    signature: Optional[dict] = None
    date: Optional[dict] = None
    attachment: Optional[dict] = None
    closing: Optional[dict] = None
    table: Optional[dict] = None
    first_line_bold: Optional[bool] = False
    page_number: Optional[bool] = True
    page_number_font: Optional[str] = '宋体'

    class Config:
        extra = 'allow'


class PunctuationIssue(BaseModel):
    para: int
    type: str
    char: str


class NumberingIssue(BaseModel):
    type: str
    detail: Optional[str] = None


class ParagraphIssue(BaseModel):
    type: str
    paras: Optional[list[int]] = None
    detail: Optional[str] = None


class FontIssue(BaseModel):
    type: str
    detail: Optional[str] = None


class AnalysisSummary(BaseModel):
    total_issues: int
    suggestions: list[str]


class AnalyzeResponse(BaseModel):
    punctuation: list[dict]
    numbering: list[dict]
    paragraph: list[dict]
    font: list[dict]
    summary: AnalysisSummary


class FormatStatsResponse(BaseModel):
    """格式化统计"""
    stats: dict
    message: str = '格式化完成'


class PunctuationStatsResponse(BaseModel):
    """标点修复统计"""
    paragraphs_fixed: int
    table_cells_fixed: int
    message: str = '标点修复完成'


class SmartFormatStatsResponse(BaseModel):
    """智能格式化统计"""
    analysis: AnalysisSummary
    punctuation: dict
    format: dict
    message: str = '智能格式化完成'
