import React from "react";
import { Check, Copy, Edit3, FileCheck, Plus, Trash2 } from "lucide-react";

import { Modal } from "./ui";
import {
  SMART_DOC_ALIGN_OPTIONS,
  SMART_DOC_FONT_OPTIONS,
  SMART_DOC_FONT_SIZE_OPTIONS,
  SMART_DOC_FORMAT_PRESET_CATEGORIES,
  SMART_DOC_LINE_SPACING_OPTIONS,
  type SmartDocFormatPreset,
  type SmartDocPresetForm,
} from "./smartDocPresetConfig";

interface HeadingConfigSectionProps {
  label: string;
  enabled: boolean;
  font: string;
  size: string;
  bold: boolean;
  italic: boolean;
  onEnabledChange: (checked: boolean) => void;
  onFontChange: (value: string) => void;
  onSizeChange: (value: string) => void;
  onBoldChange: (checked: boolean) => void;
  onItalicChange: (checked: boolean) => void;
}

const HeadingConfigSection: React.FC<HeadingConfigSectionProps> = ({
  label,
  enabled,
  font,
  size,
  bold,
  italic,
  onEnabledChange,
  onFontChange,
  onSizeChange,
  onBoldChange,
  onItalicChange,
}) => (
  <>
    <div className="flex items-center gap-2 pt-1">
      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </label>
    </div>

    {enabled && (
      <div className="grid grid-cols-4 gap-2">
        <select
          value={font}
          onChange={(event) => onFontChange(event.target.value)}
          className="px-2 py-1.5 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400 bg-white"
        >
          {SMART_DOC_FONT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          value={size}
          onChange={(event) => onSizeChange(event.target.value)}
          className="px-2 py-1.5 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400 bg-white"
        >
          {SMART_DOC_FONT_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={bold}
            onChange={(event) => onBoldChange(event.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          加粗
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={italic}
            onChange={(event) => onItalicChange(event.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          斜体
        </label>
      </div>
    )}
  </>
);

interface SmartDocPresetManagerProps {
  open: boolean;
  formatPresets: SmartDocFormatPreset[];
  editingPreset: SmartDocFormatPreset | null;
  presetForm: SmartDocPresetForm;
  onClose: () => void;
  onPresetFormChange: (patch: Partial<SmartDocPresetForm>) => void;
  onAddPreset: () => void;
  onUpdatePreset: () => void;
  onCancelEdit: () => void;
  onEditPreset: (preset: SmartDocFormatPreset) => void;
  onCopyPreset: (preset: SmartDocFormatPreset) => void;
  onDeletePreset: (id: string) => void;
}

export const SmartDocPresetManager: React.FC<SmartDocPresetManagerProps> = ({
  open,
  formatPresets,
  editingPreset,
  presetForm,
  onClose,
  onPresetFormChange,
  onAddPreset,
  onUpdatePreset,
  onCancelEdit,
  onEditPreset,
  onCopyPreset,
  onDeletePreset,
}) => {
  if (!open) return null;

  const visibleCategories = SMART_DOC_FORMAT_PRESET_CATEGORIES.filter(
    (category) => category !== "全部",
  );
  const hasHeadingLevel =
    presetForm.headingEnabled ||
    presetForm.heading2Enabled ||
    presetForm.heading3Enabled ||
    presetForm.heading4Enabled ||
    presetForm.heading5Enabled;

  return (
    <Modal
      title="管理排版格式预设"
      onClose={onClose}
      footer={
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          完成
        </button>
      }
    >
      <div className="space-y-4 max-h-[70vh] overflow-auto">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="text-sm font-medium text-gray-700">
            {editingPreset ? `编辑预设「${editingPreset.name}」` : "新建自定义预设"}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={presetForm.name}
              onChange={(event) =>
                onPresetFormChange({ name: event.target.value })
              }
              placeholder="预设名称 *"
              className="col-span-2 px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
            />
            <select
              value={presetForm.category}
              onChange={(event) =>
                onPresetFormChange({ category: event.target.value })
              }
              className="px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              {visibleCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={presetForm.description}
              onChange={(event) =>
                onPresetFormChange({ description: event.target.value })
              }
              placeholder="简要描述（可选）"
              className="px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div className="text-xs text-gray-500 font-medium pt-1">标题格式</div>
          <div className="grid grid-cols-5 gap-2">
            <select
              value={presetForm.titleFont}
              onChange={(event) =>
                onPresetFormChange({ titleFont: event.target.value })
              }
              className="px-2 py-1.5 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              {SMART_DOC_FONT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={presetForm.titleSize}
              onChange={(event) =>
                onPresetFormChange({ titleSize: event.target.value })
              }
              className="px-2 py-1.5 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              {SMART_DOC_FONT_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={presetForm.titleAlign}
              onChange={(event) =>
                onPresetFormChange({ titleAlign: event.target.value })
              }
              className="px-2 py-1.5 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              {SMART_DOC_ALIGN_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={presetForm.titleBold}
                onChange={(event) =>
                  onPresetFormChange({ titleBold: event.target.checked })
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              加粗
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={presetForm.titleItalic}
                onChange={(event) =>
                  onPresetFormChange({ titleItalic: event.target.checked })
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              斜体
            </label>
          </div>

          <div className="text-xs text-gray-500 font-medium pt-1">正文格式</div>
          <div className="grid grid-cols-5 gap-2">
            <select
              value={presetForm.bodyFont}
              onChange={(event) =>
                onPresetFormChange({ bodyFont: event.target.value })
              }
              className="px-2 py-1.5 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              {SMART_DOC_FONT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={presetForm.bodySize}
              onChange={(event) =>
                onPresetFormChange({ bodySize: event.target.value })
              }
              className="px-2 py-1.5 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              {SMART_DOC_FONT_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={presetForm.lineSpacing}
              onChange={(event) =>
                onPresetFormChange({ lineSpacing: event.target.value })
              }
              className="px-2 py-1.5 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              {SMART_DOC_LINE_SPACING_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={presetForm.bodyIndent}
                onChange={(event) =>
                  onPresetFormChange({ bodyIndent: event.target.checked })
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              首行缩进
            </label>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={presetForm.bodyBold}
                  onChange={(event) =>
                    onPresetFormChange({ bodyBold: event.target.checked })
                  }
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                粗
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={presetForm.bodyItalic}
                  onChange={(event) =>
                    onPresetFormChange({ bodyItalic: event.target.checked })
                  }
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                斜
              </label>
            </div>
          </div>

          {!hasHeadingLevel && (
            <div className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5 border border-dashed border-amber-200">
              未启用任何标题层级，所有内容将作为正文处理（适用于请示件等纯正文公文）
            </div>
          )}

          <HeadingConfigSection
            label="一级标题格式"
            enabled={presetForm.headingEnabled}
            font={presetForm.headingFont}
            size={presetForm.headingSize}
            bold={presetForm.headingBold}
            italic={presetForm.headingItalic}
            onEnabledChange={(checked) =>
              onPresetFormChange({ headingEnabled: checked })
            }
            onFontChange={(value) => onPresetFormChange({ headingFont: value })}
            onSizeChange={(value) => onPresetFormChange({ headingSize: value })}
            onBoldChange={(checked) =>
              onPresetFormChange({ headingBold: checked })
            }
            onItalicChange={(checked) =>
              onPresetFormChange({ headingItalic: checked })
            }
          />
          <HeadingConfigSection
            label="二级标题格式"
            enabled={presetForm.heading2Enabled}
            font={presetForm.heading2Font}
            size={presetForm.heading2Size}
            bold={presetForm.heading2Bold}
            italic={presetForm.heading2Italic}
            onEnabledChange={(checked) =>
              onPresetFormChange({ heading2Enabled: checked })
            }
            onFontChange={(value) =>
              onPresetFormChange({ heading2Font: value })
            }
            onSizeChange={(value) =>
              onPresetFormChange({ heading2Size: value })
            }
            onBoldChange={(checked) =>
              onPresetFormChange({ heading2Bold: checked })
            }
            onItalicChange={(checked) =>
              onPresetFormChange({ heading2Italic: checked })
            }
          />
          <HeadingConfigSection
            label="三级标题格式"
            enabled={presetForm.heading3Enabled}
            font={presetForm.heading3Font}
            size={presetForm.heading3Size}
            bold={presetForm.heading3Bold}
            italic={presetForm.heading3Italic}
            onEnabledChange={(checked) =>
              onPresetFormChange({ heading3Enabled: checked })
            }
            onFontChange={(value) =>
              onPresetFormChange({ heading3Font: value })
            }
            onSizeChange={(value) =>
              onPresetFormChange({ heading3Size: value })
            }
            onBoldChange={(checked) =>
              onPresetFormChange({ heading3Bold: checked })
            }
            onItalicChange={(checked) =>
              onPresetFormChange({ heading3Italic: checked })
            }
          />
          <HeadingConfigSection
            label="四级标题格式"
            enabled={presetForm.heading4Enabled}
            font={presetForm.heading4Font}
            size={presetForm.heading4Size}
            bold={presetForm.heading4Bold}
            italic={presetForm.heading4Italic}
            onEnabledChange={(checked) =>
              onPresetFormChange({ heading4Enabled: checked })
            }
            onFontChange={(value) =>
              onPresetFormChange({ heading4Font: value })
            }
            onSizeChange={(value) =>
              onPresetFormChange({ heading4Size: value })
            }
            onBoldChange={(checked) =>
              onPresetFormChange({ heading4Bold: checked })
            }
            onItalicChange={(checked) =>
              onPresetFormChange({ heading4Italic: checked })
            }
          />
          <HeadingConfigSection
            label="五级标题格式"
            enabled={presetForm.heading5Enabled}
            font={presetForm.heading5Font}
            size={presetForm.heading5Size}
            bold={presetForm.heading5Bold}
            italic={presetForm.heading5Italic}
            onEnabledChange={(checked) =>
              onPresetFormChange({ heading5Enabled: checked })
            }
            onFontChange={(value) =>
              onPresetFormChange({ heading5Font: value })
            }
            onSizeChange={(value) =>
              onPresetFormChange({ heading5Size: value })
            }
            onBoldChange={(checked) =>
              onPresetFormChange({ heading5Bold: checked })
            }
            onItalicChange={(checked) =>
              onPresetFormChange({ heading5Italic: checked })
            }
          />

          <textarea
            value={presetForm.instruction}
            onChange={(event) =>
              onPresetFormChange({ instruction: event.target.value })
            }
            placeholder="补充说明（可选），如：附件列表在正文后空一行标注..."
            className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            rows={2}
          />

          <div className="flex gap-2">
            {editingPreset ? (
              <>
                <button
                  onClick={onUpdatePreset}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1.5"
                >
                  <Check size={14} /> 保存修改
                </button>
                <button
                  onClick={onCancelEdit}
                  className="px-4 py-2 border text-gray-600 rounded-lg text-sm hover:bg-gray-50"
                >
                  取消
                </button>
              </>
            ) : (
              <button
                onClick={onAddPreset}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1.5"
              >
                <Plus size={14} /> 添加预设
              </button>
            )}
          </div>
        </div>

        {visibleCategories.map((category) => {
          const presets = formatPresets.filter(
            (preset) => preset.category === category,
          );
          if (!presets.length) return null;

          return (
            <div key={category}>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                {category}（{presets.length} 个）
              </div>
              <div className="space-y-2">
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-start gap-3 p-3 bg-white border rounded-lg hover:bg-gray-50 group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FileCheck size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 flex items-center gap-2">
                        {preset.name}
                        {preset.builtIn && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded">
                            内置
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {preset.description}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1 line-clamp-2">
                        {preset.instruction}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={() => onEditPreset(preset)}
                        className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"
                        title="编辑"
                      >
                        <Edit3 size={14} />
                      </button>
                      {preset.builtIn && (
                        <button
                          onClick={() => onCopyPreset(preset)}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"
                          title="复制为新预设"
                        >
                          <Copy size={14} />
                        </button>
                      )}
                      {!preset.builtIn && (
                        <button
                          onClick={() => onDeletePreset(preset.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
};
