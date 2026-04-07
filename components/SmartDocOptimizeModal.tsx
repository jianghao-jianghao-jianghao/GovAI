import React from "react";

import type { KBCollection } from "../api";
import { Modal } from "./ui";

interface SmartDocOptimizeModalProps {
  open: boolean;
  targetTitle?: string | null;
  kbCollections: KBCollection[];
  selectedKbId: string;
  onKbChange: (kbId: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export const SmartDocOptimizeModal: React.FC<SmartDocOptimizeModalProps> = ({
  open,
  targetTitle,
  kbCollections,
  selectedKbId,
  onKbChange,
  onClose,
  onConfirm,
}) => {
  if (!open) return null;

  return (
    <Modal
      title="智能优化配置"
      onClose={onClose}
      size="sm"
      footer={
        <button
          onClick={onConfirm}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
        >
          确认优化
        </button>
      }
    >
      <div className="space-y-4">
        <div className="p-3 bg-blue-50 border border-blue-100 rounded text-xs text-blue-700">
          即将针对<b>《{targetTitle || "未命名公文"}》</b>
          进行内容优化，请选择引用的知识库范围。
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 mb-2 block">
            引用知识库
          </label>
          <select
            className="w-full border p-2 rounded text-sm bg-white outline-none focus:ring-1 focus:ring-blue-400"
            value={selectedKbId}
            onChange={(event) => onKbChange(event.target.value)}
          >
            <option value="">全部知识库</option>
            {kbCollections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[10px] text-gray-400 italic">
          * 选择&quot;全部知识库&quot;将联合检索系统全量合规条文。
        </p>
      </div>
    </Modal>
  );
};
