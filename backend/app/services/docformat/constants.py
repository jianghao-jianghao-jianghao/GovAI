"""公文格式处理常量 — 从 docformat-gui 提取"""

# 常用中文字体
COMMON_FONTS_CN = [
    '仿宋_GB2312', '仿宋', '宋体', '黑体', '楷体_GB2312', '楷体',
    '方正小标宋简体', '方正仿宋_GBK', '华文仿宋', '华文中宋'
]

# 常用英文字体
COMMON_FONTS_EN = [
    'Times New Roman', 'Arial', 'Calibri', 'Cambria'
]

# 字号对照表 (中文名, pt值)
FONT_SIZES = [
    ('初号', 42), ('小初', 36), ('一号', 26), ('小一', 24),
    ('二号', 22), ('小二', 18), ('三号', 16), ('小三', 15),
    ('四号', 14), ('小四', 12), ('五号', 10.5), ('小五', 9),
]

# 正文联动字体组 — 修改正文字体时这些元素联动
BODY_FONT_GROUP = ['body', 'heading3', 'heading4', 'closing', 'attachment', 'signature', 'date']

# 默认自定义预设模板
DEFAULT_CUSTOM_SETTINGS = {
    'name': '自定义格式',
    'page': {'top': 3.7, 'bottom': 3.5, 'left': 2.8, 'right': 2.6},
    'title': {
        'font_cn': '方正小标宋简体', 'font_en': 'Times New Roman',
        'size': 22, 'bold': False, 'align': 'center', 'indent': 0,
        'line_spacing': 28, 'space_before': 0, 'space_after': 0
    },
    'recipient': {
        'font_cn': '仿宋_GB2312', 'font_en': 'Times New Roman',
        'size': 16, 'bold': False, 'align': 'left', 'indent': 0,
        'line_spacing': 28, 'space_before': 0, 'space_after': 0
    },
    'heading1': {
        'font_cn': '黑体', 'font_en': 'Times New Roman',
        'size': 16, 'bold': False, 'align': 'left', 'indent': 32,
        'line_spacing': 28, 'space_before': 0, 'space_after': 0
    },
    'heading2': {
        'font_cn': '楷体_GB2312', 'font_en': 'Times New Roman',
        'size': 16, 'bold': False, 'align': 'left', 'indent': 32,
        'line_spacing': 28, 'space_before': 0, 'space_after': 0
    },
    'heading3': {
        'font_cn': '仿宋_GB2312', 'font_en': 'Times New Roman',
        'size': 16, 'bold': True, 'align': 'left', 'indent': 32,
        'line_spacing': 28, 'space_before': 0, 'space_after': 0
    },
    'heading4': {
        'font_cn': '仿宋_GB2312', 'font_en': 'Times New Roman',
        'size': 16, 'bold': False, 'align': 'left', 'indent': 32,
        'line_spacing': 28, 'space_before': 0, 'space_after': 0
    },
    'body': {
        'font_cn': '仿宋_GB2312', 'font_en': 'Times New Roman',
        'size': 16, 'bold': False, 'align': 'justify',
        'indent': 32, 'line_spacing': 28, 'space_before': 0, 'space_after': 0
    },
    'signature': {
        'font_cn': '仿宋_GB2312', 'font_en': 'Times New Roman',
        'size': 16, 'bold': False, 'align': 'right', 'indent': 0,
        'line_spacing': 28, 'space_before': 0, 'space_after': 0
    },
    'date': {
        'font_cn': '仿宋_GB2312', 'font_en': 'Times New Roman',
        'size': 16, 'bold': False, 'align': 'right', 'indent': 0,
        'line_spacing': 28, 'space_before': 0, 'space_after': 0
    },
    'attachment': {
        'font_cn': '仿宋_GB2312', 'font_en': 'Times New Roman',
        'size': 16, 'bold': False, 'align': 'justify', 'indent': 32,
        'line_spacing': 28, 'space_before': 0, 'space_after': 0
    },
    'closing': {
        'font_cn': '仿宋_GB2312', 'font_en': 'Times New Roman',
        'size': 16, 'bold': False, 'align': 'left', 'indent': 32,
        'line_spacing': 28, 'space_before': 0, 'space_after': 0
    },
    'table': {
        'font_cn': '仿宋_GB2312', 'font_en': 'Times New Roman',
        'size': 12, 'bold': False, 'line_spacing': 22,
        'first_line_indent': 0, 'header_bold': True
    },
    'first_line_bold': False,
    'page_number': True,
    'page_number_font': '宋体',
}

# 可用预设名称与标签
PRESET_LABELS = {
    'official': '公文格式 (GB/T 9704-2012)',
    'academic': '学术论文格式',
    'legal': '法律文书格式',
    'custom': '自定义格式',
}
