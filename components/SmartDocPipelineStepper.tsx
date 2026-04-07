import React from "react";
import { Check, ChevronRight, type LucideIcon } from "lucide-react";

export interface SmartDocPipelineStage {
  id: string;
  label: string;
  icon: LucideIcon;
  desc: string;
}

interface SmartDocPipelineStepperProps {
  stages: readonly SmartDocPipelineStage[];
  activeStageIndex: number;
  completedStages: Set<number>;
  onSelectStage: (index: number, stageId: string) => void;
}

export const SmartDocPipelineStepper: React.FC<
  SmartDocPipelineStepperProps
> = ({ stages, activeStageIndex, completedStages, onSelectStage }) => (
  <div className="flex items-center justify-center gap-1 py-3 px-4 bg-white border-b">
    {stages.map((stage, index) => {
      const done = completedStages.has(index);
      const active = activeStageIndex === index;

      return (
        <React.Fragment key={stage.id}>
          <button
            onClick={() => onSelectStage(index, stage.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              active
                ? "bg-blue-50 text-blue-700 ring-1 ring-blue-300"
                : done
                  ? "bg-green-50 text-green-700"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            }`}
            title={stage.desc}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                done
                  ? "bg-green-500 text-white"
                  : active
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-500"
              }`}
            >
              {done ? <Check size={14} /> : index + 1}
            </div>
            <span className="hidden sm:inline">{stage.label}</span>
          </button>
          {index < stages.length - 1 && (
            <ChevronRight
              size={16}
              className={`${done ? "text-green-400" : "text-gray-300"} shrink-0`}
            />
          )}
        </React.Fragment>
      );
    })}
  </div>
);
