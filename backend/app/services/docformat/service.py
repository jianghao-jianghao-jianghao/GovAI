"""公文格式处理 — 统一服务入口"""

import json
import os
import logging
import shutil
import uuid
from pathlib import Path
from typing import Optional

from .formatter import format_document, PRESETS
from .analyzer import analyze_document
from .punctuation import process_document as fix_punctuation_document
from .constants import DEFAULT_CUSTOM_SETTINGS, PRESET_LABELS

logger = logging.getLogger('docformat.service')

# 临时文件目录
TEMP_DIR = Path(os.getenv('DOCFORMAT_TEMP_DIR', '/tmp/docformat'))
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# 自定义预设存储
CUSTOM_PRESETS_FILE = Path(os.path.dirname(__file__)) / 'custom_presets.json'


def _load_custom_presets() -> dict:
    """从 JSON 文件加载用户自定义预设"""
    if CUSTOM_PRESETS_FILE.exists():
        try:
            return json.loads(CUSTOM_PRESETS_FILE.read_text('utf-8'))
        except Exception:
            return {}
    return {}


def _save_custom_presets(presets: dict):
    """保存用户自定义预设到 JSON 文件"""
    CUSTOM_PRESETS_FILE.write_text(
        json.dumps(presets, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )


def _ensure_temp():
    TEMP_DIR.mkdir(parents=True, exist_ok=True)


def _temp_path(suffix='.docx') -> Path:
    _ensure_temp()
    return TEMP_DIR / f"{uuid.uuid4().hex}{suffix}"


class DocFormatService:
    """公文格式处理服务"""

    @staticmethod
    def list_presets() -> list[dict]:
        """获取所有可用预设（内置 + 用户自定义）"""
        result = []
        for key, label in PRESET_LABELS.items():
            preset_data = PRESETS.get(key, {})
            result.append({
                'key': key,
                'name': label,
                'description': preset_data.get('name', label),
                'is_builtin': True,
            })
        # 追加用户自定义预设
        custom = _load_custom_presets()
        for key, data in custom.items():
            result.append({
                'key': key,
                'name': data.get('name', key),
                'description': data.get('name', key),
                'is_builtin': False,
            })
        return result

    @staticmethod
    def get_preset_detail(preset_name: str) -> dict:
        """获取预设详细配置"""
        if preset_name == 'custom':
            return {'key': 'custom', **DEFAULT_CUSTOM_SETTINGS}
        if preset_name in PRESETS:
            return {'key': preset_name, **PRESETS[preset_name]}
        # 查找用户自定义预设
        custom = _load_custom_presets()
        if preset_name in custom:
            return {'key': preset_name, **custom[preset_name]}
        raise ValueError(f'未知预设: {preset_name}')

    @staticmethod
    def format(
        input_path: str,
        preset_name: str = 'official',
        custom_preset: Optional[dict] = None,
    ) -> tuple[str, dict]:
        """格式化文档

        Args:
            input_path: 上传的 .docx 文件路径
            preset_name: 预设名
            custom_preset: 自定义预设（preset_name='custom' 时使用）

        Returns:
            (output_path, stats)
        """
        output_path = str(_temp_path())
        stats = format_document(
            input_path, output_path,
            preset_name=preset_name,
            custom_preset=custom_preset,
        )
        logger.info(f"Format done: {input_path} → {output_path}")
        return output_path, stats

    @staticmethod
    def analyze(input_path: str) -> dict:
        """格式诊断

        Returns:
            分析结果 dict
        """
        results = analyze_document(input_path)
        logger.info(f"Analyze done: {input_path}, issues={results['summary']['total_issues']}")
        return results

    @staticmethod
    def fix_punctuation(input_path: str) -> tuple[str, dict]:
        """修复标点

        Returns:
            (output_path, stats)
        """
        output_path = str(_temp_path())
        stats = fix_punctuation_document(input_path, output_path)
        logger.info(f"Punctuation fix done: {input_path} → {output_path}")
        return output_path, stats

    @staticmethod
    def smart_format(
        input_path: str,
        preset_name: str = 'official',
        custom_preset: Optional[dict] = None,
        fix_punct: bool = True,
    ) -> tuple[str, dict]:
        """智能格式化：先修标点再格式化

        Returns:
            (output_path, combined_stats)
        """
        combined_stats = {}

        # 第一步：诊断
        analysis = analyze_document(input_path)
        combined_stats['analysis'] = analysis['summary']

        # 第二步：修标点
        if fix_punct and analysis['punctuation']:
            punct_output = str(_temp_path())
            punct_stats = fix_punctuation_document(input_path, punct_output)
            combined_stats['punctuation'] = punct_stats
            format_input = punct_output
        else:
            combined_stats['punctuation'] = {'paragraphs_fixed': 0, 'table_cells_fixed': 0}
            format_input = input_path

        # 第三步：格式化
        final_output = str(_temp_path())
        format_stats = format_document(
            format_input, final_output,
            preset_name=preset_name,
            custom_preset=custom_preset,
        )
        combined_stats['format'] = format_stats

        # 清理中间文件
        if format_input != input_path and os.path.exists(format_input):
            try:
                os.remove(format_input)
            except OSError:
                pass

        logger.info(f"Smart format done: {input_path} → {final_output}")
        return final_output, combined_stats

    @staticmethod
    def cleanup_temp_file(path: str):
        """清理临时文件"""
        try:
            if os.path.exists(path) and str(path).startswith(str(TEMP_DIR)):
                os.remove(path)
        except OSError:
            pass

    # ── 自定义预设 CRUD ──

    @staticmethod
    def create_preset(key: str, data: dict) -> dict:
        """创建用户自定义预设"""
        builtin = set(PRESET_LABELS.keys()) | set(PRESETS.keys())
        if key in builtin:
            raise ValueError(f'不能覆盖内置预设: {key}')
        custom = _load_custom_presets()
        if key in custom:
            raise ValueError(f'预设已存在: {key}')
        custom[key] = data
        _save_custom_presets(custom)
        logger.info(f"Created custom preset: {key}")
        return {'key': key, **data}

    @staticmethod
    def update_preset(key: str, data: dict) -> dict:
        """更新用户自定义预设"""
        builtin = set(PRESET_LABELS.keys()) | set(PRESETS.keys())
        if key in builtin:
            raise ValueError(f'不能修改内置预设: {key}')
        custom = _load_custom_presets()
        if key not in custom:
            raise ValueError(f'预设不存在: {key}')
        custom[key] = data
        _save_custom_presets(custom)
        logger.info(f"Updated custom preset: {key}")
        return {'key': key, **data}

    @staticmethod
    def delete_preset(key: str):
        """删除用户自定义预设"""
        builtin = set(PRESET_LABELS.keys()) | set(PRESETS.keys())
        if key in builtin:
            raise ValueError(f'不能删除内置预设: {key}')
        custom = _load_custom_presets()
        if key not in custom:
            raise ValueError(f'预设不存在: {key}')
        del custom[key]
        _save_custom_presets(custom)
        logger.info(f"Deleted custom preset: {key}")
