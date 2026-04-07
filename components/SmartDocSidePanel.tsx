import React from "react";
import {
  BookOpen,
  MessageSquare,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import type { Material } from "../api";

export type SmartDocInstructionTemplate = {
  id: string;
  stage: "draft" | "review" | "format" | "all";
  label: string;
  content: string;
  builtIn: boolean;
};

export type SmartDocNewTemplateDraft = {
  label: string;
  content: string;
  stage: SmartDocInstructionTemplate["stage"];
};

export type SmartDocNewMaterialDraft = {
  title: string;
  category: string;
  content: string;
};

interface SmartDocSidePanelProps {
  canManageMaterial: boolean;
  materialTab: "material" | "templates";
  currentStageId: "draft" | "review" | "format";
  currentStageLabel: string;
  instructionTemplates: SmartDocInstructionTemplate[];
  isAddingTemplate: boolean;
  newTemplate: SmartDocNewTemplateDraft;
  materials: Material[];
  matSearch: string;
  matCategory: string;
  isAddingMat: boolean;
  newMat: SmartDocNewMaterialDraft;
  onClose: () => void;
  onMaterialTabChange: (tab: "material" | "templates") => void;
  onJumpToStage: (stageId: "draft" | "review" | "format") => void;
  onUseTemplate: (template: SmartDocInstructionTemplate) => void;
  onDeleteTemplate: (id: string) => void;
  onStartAddingTemplate: () => void;
  onCancelAddingTemplate: () => void;
  onNewTemplateChange: (
    patch: Partial<SmartDocNewTemplateDraft>,
  ) => void;
  onSaveTemplate: () => void;
  onMatSearchChange: (value: string) => void;
  onMatCategoryChange: (category: string) => void;
  onStartAddingMaterial: () => void;
  onUseMaterial: (content: string) => void;
  onDeleteMaterial: (id: string) => void;
  onNewMaterialChange: (
    patch: Partial<SmartDocNewMaterialDraft>,
  ) => void;
  onSaveMaterial: () => void;
  onCancelAddingMaterial: () => void;
}

const MATERIAL_CATEGORIES = ["全部", "开头", "结尾", "过渡", "政策"];

export const SmartDocSidePanel: React.FC<SmartDocSidePanelProps> = ({
  canManageMaterial,
  materialTab,
  currentStageId,
  currentStageLabel,
  instructionTemplates,
  isAddingTemplate,
  newTemplate,
  materials,
  matSearch,
  matCategory,
  isAddingMat,
  newMat,
  onClose,
  onMaterialTabChange,
  onJumpToStage,
  onUseTemplate,
  onDeleteTemplate,
  onStartAddingTemplate,
  onCancelAddingTemplate,
  onNewTemplateChange,
  onSaveTemplate,
  onMatSearchChange,
  onMatCategoryChange,
  onStartAddingMaterial,
  onUseMaterial,
  onDeleteMaterial,
  onNewMaterialChange,
  onSaveMaterial,
  onCancelAddingMaterial,
}) => {
  const visibleTemplates = instructionTemplates.filter(
    (template) =>
      template.stage === currentStageId || template.stage === "all",
  );
  const visibleMaterials = materials.filter(
    (material) =>
      (matCategory === "全部" || material.category === matCategory) &&
      material.title.includes(matSearch),
  );

  return (
    <div className="w-80 bg-white border-l shadow-xl z-10 flex flex-col animate-in slide-in-from-right duration-300">
      <div className="p-3 border-b flex justify-between items-center bg-gray-50">
        <span className="font-bold text-gray-700 flex items-center">
          <BookOpen size={16} className="mr-2" /> 素材 & 指令
        </span>
        <button onClick={onClose}>
          <X size={18} className="text-gray-400 hover:text-gray-600" />
        </button>
      </div>

      <div className="flex border-b bg-white">
        <button
          onClick={() => onMaterialTabChange("templates")}
          className={`flex-1 py-2 text-xs font-medium text-center border-b-2 transition ${materialTab === "templates" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          <Sparkles size={12} className="inline mr-1" />
          常用指令
        </button>
        <button
          onClick={() => onMaterialTabChange("material")}
          className={`flex-1 py-2 text-xs font-medium text-center border-b-2 transition ${materialTab === "material" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          <BookOpen size={12} className="inline mr-1" />
          素材库
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {materialTab === "templates" && (
          <>
            <div className="text-[11px] text-gray-500 bg-blue-50 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <Sparkles size={12} className="text-blue-500" />
              当前阶段：
              <span className="font-medium text-blue-700">
                {currentStageLabel}
              </span>
              · 点击模板即可填入输入框
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {[
                { key: "current", label: "当前阶段" },
                { key: "draft", label: "起草" },
                { key: "review", label: "审查" },
                { key: "format", label: "格式化" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => {
                    if (tab.key !== "current") {
                      onJumpToStage(
                        tab.key as "draft" | "review" | "format",
                      );
                    }
                  }}
                  className={`px-2 py-0.5 text-[11px] rounded-full border transition ${
                    tab.key === "current" || tab.key === currentStageId
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {visibleTemplates.map((template) => (
                <div
                  key={template.id}
                  className="p-2.5 border rounded-lg hover:border-blue-400 hover:shadow-sm cursor-pointer group bg-slate-50 transition relative"
                  onClick={() => onUseTemplate(template)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700 flex items-center gap-1">
                      <Send size={10} className="text-blue-500" />
                      {template.label}
                    </span>
                    <div className="flex items-center gap-1">
                      {!template.builtIn && (
                        <Trash2
                          size={12}
                          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteTemplate(template.id);
                          }}
                        />
                      )}
                      <span className="text-[10px] text-blue-600 opacity-0 group-hover:opacity-100 font-medium">
                        点击填入 →
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">
                    {template.content}
                  </p>
                </div>
              ))}
            </div>

            {!isAddingTemplate ? (
              <button
                onClick={onStartAddingTemplate}
                className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition"
              >
                <Plus size={14} /> 添加自定义指令模板
              </button>
            ) : (
              <div className="bg-gray-50 p-3 rounded-lg border space-y-2">
                <h4 className="font-medium text-gray-700 text-xs">
                  新增指令模板
                </h4>
                <input
                  className="w-full border rounded px-2 py-1.5 text-xs"
                  placeholder="模板名称"
                  value={newTemplate.label}
                  onChange={(event) =>
                    onNewTemplateChange({ label: event.target.value })
                  }
                />
                <select
                  className="w-full border rounded px-2 py-1.5 text-xs"
                  value={newTemplate.stage}
                  onChange={(event) =>
                    onNewTemplateChange({
                      stage: event.target.value as SmartDocInstructionTemplate["stage"],
                    })
                  }
                >
                  <option value="draft">起草阶段</option>
                  <option value="review">审查阶段</option>
                  <option value="format">格式化阶段</option>
                  <option value="all">所有阶段</option>
                </select>
                <textarea
                  className="w-full border rounded px-2 py-1.5 text-xs h-20 resize-none"
                  placeholder="指令内容，例如：请帮我起草一份关于…的通知"
                  value={newTemplate.content}
                  onChange={(event) =>
                    onNewTemplateChange({ content: event.target.value })
                  }
                />
                <div className="flex gap-2">
                  <button
                    onClick={onSaveTemplate}
                    className="flex-1 bg-blue-600 text-white py-1.5 rounded text-xs"
                  >
                    保存
                  </button>
                  <button
                    onClick={onCancelAddingTemplate}
                    className="flex-1 bg-white border text-gray-600 py-1.5 rounded text-xs"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {materialTab === "material" &&
          (!isAddingMat ? (
            <>
              <div className="flex justify-between items-center mb-2">
                <div className="relative flex-1 mr-2">
                  <input
                    className="w-full border rounded pl-8 pr-2 py-2 text-sm"
                    placeholder="搜索素材..."
                    value={matSearch}
                    onChange={(event) => onMatSearchChange(event.target.value)}
                  />
                  <Search
                    size={14}
                    className="absolute left-2.5 top-3 text-gray-400"
                  />
                </div>
                {canManageMaterial && (
                  <button
                    onClick={onStartAddingMaterial}
                    className="p-2 bg-blue-50 text-blue-600 rounded border border-blue-100 hover:bg-blue-100"
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {MATERIAL_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    onClick={() => onMatCategoryChange(category)}
                    className={`px-3 py-1 text-xs rounded-full whitespace-nowrap border ${matCategory === category ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}
                  >
                    {category}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                {visibleMaterials.map((material) => (
                  <div
                    key={material.id}
                    className="p-3 border rounded hover:border-blue-400 hover:shadow-sm cursor-pointer group bg-slate-50 relative"
                    onClick={() => onUseMaterial(material.content)}
                  >
                    <div className="font-bold text-gray-700 text-xs mb-1 flex justify-between">
                      {material.title}
                      <div className="flex items-center space-x-1">
                        <span className="text-[10px] text-gray-400 bg-white px-1 border rounded">
                          {material.category}
                        </span>
                        {canManageMaterial && (
                          <Trash2
                            size={12}
                            className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteMaterial(material.id);
                            }}
                          />
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 line-clamp-3 leading-relaxed">
                      {material.content}
                    </div>
                    <div className="mt-2 text-[10px] text-blue-600 opacity-0 group-hover:opacity-100 font-bold text-right">
                      点击插入 +
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="bg-gray-50 p-4 rounded border">
              <h4 className="font-bold text-gray-700 mb-3 text-sm">
                新增素材
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    标题
                  </label>
                  <input
                    className="w-full border rounded p-2 text-sm"
                    value={newMat.title}
                    onChange={(event) =>
                      onNewMaterialChange({ title: event.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    分类
                  </label>
                  <select
                    className="w-full border rounded p-2 text-sm"
                    value={newMat.category}
                    onChange={(event) =>
                      onNewMaterialChange({ category: event.target.value })
                    }
                  >
                    {["开头", "结尾", "过渡", "政策", "通用"].map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    内容
                  </label>
                  <textarea
                    className="w-full border rounded p-2 text-sm h-24"
                    value={newMat.content}
                    onChange={(event) =>
                      onNewMaterialChange({ content: event.target.value })
                    }
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={onSaveMaterial}
                    className="flex-1 bg-blue-600 text-white py-1.5 rounded text-sm"
                  >
                    保存
                  </button>
                  <button
                    onClick={onCancelAddingMaterial}
                    className="flex-1 bg-white border text-gray-600 py-1.5 rounded text-sm"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};
