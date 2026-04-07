export interface SmartDocFormatPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  instruction: string;
  systemPrompt: string;
  builtIn: boolean;
}

export interface SmartDocPresetForm {
  name: string;
  category: string;
  description: string;
  instruction: string;
  titleFont: string;
  titleSize: string;
  titleAlign: string;
  titleBold: boolean;
  titleItalic: boolean;
  bodyFont: string;
  bodySize: string;
  bodyIndent: boolean;
  bodyBold: boolean;
  bodyItalic: boolean;
  lineSpacing: string;
  headingEnabled: boolean;
  headingFont: string;
  headingSize: string;
  headingBold: boolean;
  headingItalic: boolean;
  heading2Enabled: boolean;
  heading2Font: string;
  heading2Size: string;
  heading2Bold: boolean;
  heading2Italic: boolean;
  heading3Enabled: boolean;
  heading3Font: string;
  heading3Size: string;
  heading3Bold: boolean;
  heading3Italic: boolean;
  heading4Enabled: boolean;
  heading4Font: string;
  heading4Size: string;
  heading4Bold: boolean;
  heading4Italic: boolean;
  heading5Enabled: boolean;
  heading5Font: string;
  heading5Size: string;
  heading5Bold: boolean;
  heading5Italic: boolean;
}

export const SMART_DOC_FORMAT_PRESET_CATEGORIES = [
  "全部",
  "公文写作",
  "日常办公",
  "会议管理",
  "工作汇报",
  "项目管理",
  "排版格式",
];

export const SMART_DOC_FONT_OPTIONS = [
  "方正小标宋体",
  "方正小标宋简体",
  "黑体",
  "仿宋",
  "仿宋_GB2312",
  "楷体",
  "楷体_GB2312",
  "宋体",
  "微软雅黑",
  "Times New Roman",
  "Arial",
  "等线",
  "华文中宋",
];

export const SMART_DOC_FONT_SIZE_OPTIONS = [
  "小初",
  "一号",
  "小一",
  "二号",
  "小二",
  "三号",
  "小三",
  "四号",
  "小四",
  "五号",
  "小五",
  "六号",
  "小六",
  "1",
  "1.5",
  "2",
  "2.5",
  "3",
  "3.5",
  "4",
  "4.5",
  "5",
  "5.5",
  "6",
  "6.5",
  "7",
  "7.5",
  "8",
  "9",
  "10",
  "10.5",
  "11",
  "12",
  "14",
  "16",
  "18",
  "20",
  "22",
  "24",
  "26",
  "28",
  "32",
  "36",
  "42",
  "48",
  "72",
];

export const SMART_DOC_ALIGN_OPTIONS = [
  "居中",
  "左对齐",
  "右对齐",
  "两端对齐",
];

export const SMART_DOC_LINE_SPACING_OPTIONS = [
  "20磅",
  "22磅",
  "24磅",
  "26磅",
  "28磅",
  "30磅",
  "1.0倍",
  "1.5倍",
  "2.0倍",
];

export const createDefaultSmartDocPresetForm = (): SmartDocPresetForm => ({
  name: "",
  category: "公文写作",
  description: "",
  instruction: "",
  titleFont: "方正小标宋体",
  titleSize: "二号",
  titleAlign: "居中",
  titleBold: true,
  titleItalic: false,
  bodyFont: "仿宋",
  bodySize: "三号",
  bodyIndent: true,
  bodyBold: false,
  bodyItalic: false,
  lineSpacing: "28磅",
  headingEnabled: false,
  headingFont: "黑体",
  headingSize: "三号",
  headingBold: false,
  headingItalic: false,
  heading2Enabled: false,
  heading2Font: "楷体",
  heading2Size: "三号",
  heading2Bold: false,
  heading2Italic: false,
  heading3Enabled: false,
  heading3Font: "仿宋",
  heading3Size: "三号",
  heading3Bold: true,
  heading3Italic: false,
  heading4Enabled: false,
  heading4Font: "仿宋",
  heading4Size: "三号",
  heading4Bold: false,
  heading4Italic: false,
  heading5Enabled: false,
  heading5Font: "仿宋",
  heading5Size: "三号",
  heading5Bold: false,
  heading5Italic: false,
});
