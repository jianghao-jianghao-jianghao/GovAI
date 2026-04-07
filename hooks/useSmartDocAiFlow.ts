import { useCallback } from "react";
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";

import {
  AI_PROCESS_CHUNK_TYPES,
  apiAiProcess,
  apiReleaseAiLock,
  isAiLockConflictError,
  stripAiLockConflictErrorPrefix,
  type AiProcessChunk,
  type DocDetail,
  type DocListItem,
  type FormatStats,
  type FormatSuggestResult,
  type FormatSuggestionItem,
  type KbReferenceItem,
  type ReviewResultState,
  type ReviewSuggestionSummary,
  type ReviewSuggestionItem,
} from "../api";
import type { StructuredParagraph } from "../components/StructuredDocRenderer";
import {
  buildAiProcessInstruction,
  normalizeAiStreamingResult,
  resolveCommonAiFeedbackChunk,
  shouldReplaceHeartbeatStatus,
  type SmartDocAiStageId,
  type SmartDocFormatPresetLike,
} from "./smartDocAiFlowUtils";

type ParagraphPhase =
  | "idle"
  | "streaming"
  | "preview"
  | "accepted"
  | "editing"
  | "saved";

type ProcessingLogEntry = {
  type: "status" | "error" | "info";
  message: string;
  ts: number;
};

type ToastLike = {
  (message: string, options?: { duration?: number }): void;
  success: (message: string, options?: { duration?: number }) => void;
  error: (message: string, options?: { duration?: number }) => void;
  info: (message: string, options?: { duration?: number }) => void;
};

type DraftLikeChunkHandlerOptions = {
  stageId: SmartDocAiStageId;
  onStatus: (message: string) => void;
  onChunkError: (message: string) => void;
  onOutline?: (outline: string) => void;
};

type CommonAiFeedbackHandlerOptions = {
  defaultStatus?: string;
  defaultError?: string;
  dedupeHeartbeat?: boolean;
  logError?: boolean;
  onStatus?: (message: string) => void;
  onError?: (message: string) => void;
};

type DraftStageChunkHandlerOptions = {
  stageId: SmartDocAiStageId;
  dedupeHeartbeat?: boolean;
  logChunkError?: boolean;
  toastInvalidParagraphIndex?: boolean;
  onStatus?: (message: string) => void;
  onError?: (message: string) => void;
  onOutline?: (outline: string) => void;
};

type UseSmartDocAiFlowParams = {
  toast: ToastLike;
  currentDoc: DocDetail | null;
  pipelineStageIndex: number;
  currentStageId: SmartDocAiStageId;
  currentStageLabel: string;
  aiInstruction: string;
  setAiInstruction: Dispatch<SetStateAction<string>>;
  selectedPreset: SmartDocFormatPresetLike | null;
  draftHeadingLevel: number;
  aiStructuredParagraphs: StructuredParagraph[];
  acceptedParagraphs: StructuredParagraph[];
  selectedDraftKbIds: string[];
  selectedKbFileIds: string[];
  outlineText: string;
  setOutlineText: Dispatch<SetStateAction<string>>;
  setShowOutlinePanel: Dispatch<SetStateAction<boolean>>;
  setCurrentDoc: Dispatch<SetStateAction<DocDetail | null>>;
  setDocs: Dispatch<SetStateAction<DocListItem[]>>;
  setAcceptedParagraphs: Dispatch<SetStateAction<StructuredParagraph[]>>;
  setAiStructuredParagraphs: Dispatch<SetStateAction<StructuredParagraph[]>>;
  setParagraphPhase: Dispatch<SetStateAction<ParagraphPhase>>;
  setIsAiProcessing: Dispatch<SetStateAction<boolean>>;
  setIsAiThinking: Dispatch<SetStateAction<boolean>>;
  setAiLockConflict: Dispatch<SetStateAction<boolean>>;
  setProcessingLog: Dispatch<SetStateAction<ProcessingLogEntry[]>>;
  appendProcessingLog: (entry: ProcessingLogEntry) => void;
  maxProcessingLog: number;
  setKbReferences: Dispatch<
    SetStateAction<KbReferenceItem[]>
  >;
  setFormatProgress: Dispatch<
    SetStateAction<{
      current: number;
      total: number;
      percent: number;
    } | null>
  >;
  setFormatStats: Dispatch<SetStateAction<FormatStats | null>>;
  setReviewResult: Dispatch<SetStateAction<ReviewResultState | null>>;
  setCompletedStages: Dispatch<SetStateAction<Set<number>>>;
  setFormatSuggestions: Dispatch<SetStateAction<FormatSuggestionItem[]>>;
  setFormatSuggestResult: Dispatch<SetStateAction<FormatSuggestResult | null>>;
  setFormatSuggestParas: Dispatch<SetStateAction<StructuredParagraph[]>>;
  setShowFormatSuggestPanel: Dispatch<SetStateAction<boolean>>;
  setIsFormatSuggesting: Dispatch<SetStateAction<boolean>>;
  flushReasoningText: (
    text: string,
    flush?: boolean,
    isDelta?: boolean,
  ) => void;
  appendStreamingText: (text: string) => void;
  resetStreamingText: (text?: string) => void;
  normalizeStreamingText: () => void;
  clearQueuedStructuredParagraphs: () => void;
  queueStructuredParagraph: (paragraph: StructuredParagraph) => void;
  flushPendingParas: (immediate?: boolean) => void;
  aiOutputRef: MutableRefObject<HTMLDivElement | null>;
  aiAbortRef: MutableRefObject<AbortController | null>;
  aiGenerationRef: MutableRefObject<number>;
  needsMoreInfoRef: MutableRefObject<boolean>;
  pushContentHistory: (content: string) => void;
  pushAiSnapshot: (paragraphs: StructuredParagraph[]) => void;
  paragraphsToText: (paragraphs: StructuredParagraph[]) => string;
  loadDocs: () => void | Promise<void>;
};

const clearParagraphChangeMarkers = (
  paragraphs: StructuredParagraph[],
): StructuredParagraph[] =>
  paragraphs.map((paragraph) => ({
    ...paragraph,
    _change: undefined,
    _original_text: undefined,
    _change_reason: undefined,
  }));

const createEmptyReviewSuggestionSummary = (): ReviewSuggestionSummary => ({
  suggestions: [],
  summary: "",
});

const isReviewSuggestionSummary = (
  result: ReviewResultState | null | undefined,
): result is ReviewSuggestionSummary =>
  Boolean(result && "suggestions" in result && Array.isArray(result.suggestions));

export function useSmartDocAiFlow({
  toast,
  currentDoc,
  pipelineStageIndex,
  currentStageId,
  currentStageLabel,
  aiInstruction,
  setAiInstruction,
  selectedPreset,
  draftHeadingLevel,
  aiStructuredParagraphs,
  acceptedParagraphs,
  selectedDraftKbIds,
  selectedKbFileIds,
  outlineText,
  setOutlineText,
  setShowOutlinePanel,
  setCurrentDoc,
  setDocs,
  setAcceptedParagraphs,
  setAiStructuredParagraphs,
  setParagraphPhase,
  setIsAiProcessing,
  setIsAiThinking,
  setAiLockConflict,
  setProcessingLog,
  appendProcessingLog,
  maxProcessingLog,
  setKbReferences,
  setFormatProgress,
  setFormatStats,
  setReviewResult,
  setCompletedStages,
  setFormatSuggestions,
  setFormatSuggestResult,
  setFormatSuggestParas,
  setShowFormatSuggestPanel,
  setIsFormatSuggesting,
  flushReasoningText,
  appendStreamingText,
  resetStreamingText,
  normalizeStreamingText,
  clearQueuedStructuredParagraphs,
  queueStructuredParagraph,
  flushPendingParas,
  aiOutputRef,
  aiAbortRef,
  aiGenerationRef,
  needsMoreInfoRef,
  pushContentHistory,
  pushAiSnapshot,
  paragraphsToText,
  loadDocs,
}: UseSmartDocAiFlowParams) {
  const appendAiStatusLog = useCallback(
    (message: string, dedupeHeartbeat = false) => {
      if (!dedupeHeartbeat) {
        appendProcessingLog({
          type: "status",
          message,
          ts: Date.now(),
        });
        return;
      }
      setProcessingLog((prev) => {
        if (prev.length > 0) {
          const last = prev[prev.length - 1];
          if (
            last.type === "status" &&
            shouldReplaceHeartbeatStatus(last.message, message)
          ) {
            return [
              ...prev.slice(0, -1),
              { type: "status" as const, message, ts: Date.now() },
            ];
          }
        }
        const next = [
          ...prev,
          { type: "status" as const, message, ts: Date.now() },
        ];
        return next.length > maxProcessingLog
          ? next.slice(-maxProcessingLog)
          : next;
      });
    },
    [appendProcessingLog, maxProcessingLog, setProcessingLog],
  );

  const applyAiReasoningUpdate = useCallback(
    (mode: "delta" | "partial" | "final", text: string) => {
      if (!text) return;
      if (mode === "delta") {
        setIsAiThinking(true);
        flushReasoningText(text, false, true);
        return;
      }
      if (mode === "partial") {
        setIsAiThinking(true);
        flushReasoningText(text);
        return;
      }
      setIsAiThinking(false);
      flushReasoningText(text, true);
    },
    [flushReasoningText, setIsAiThinking],
  );

  const appendAiErrorLog = useCallback(
    (message: string) => {
      appendProcessingLog({
        type: "error",
        message,
        ts: Date.now(),
      });
    },
    [appendProcessingLog],
  );

  const applyAiDoneChunk = useCallback(
    (chunk: AiProcessChunk, stageId: SmartDocAiStageId) => {
      if (chunk.full_content && stageId !== "review") {
        pushContentHistory(chunk.full_content);
        setCurrentDoc((prev) =>
          prev ? { ...prev, content: chunk.full_content } : prev,
        );
      }
      if (chunk.doc_type) {
        setCurrentDoc((prev) =>
          prev ? { ...prev, doc_type: chunk.doc_type } : prev,
        );
      }
      if (chunk.new_title) {
        const nextTitle = chunk.new_title;
        setCurrentDoc((prev) =>
          prev ? { ...prev, title: nextTitle } : prev,
        );
        setDocs((prev) =>
          prev.map((doc) =>
            doc.id === currentDoc?.id ? { ...doc, title: nextTitle } : doc,
          ),
        );
      }
    },
    [currentDoc?.id, pushContentHistory, setCurrentDoc, setDocs],
  );

  const handleCommonAiFeedbackChunk = useCallback(
    (chunk: AiProcessChunk, options?: CommonAiFeedbackHandlerOptions) => {
      const feedback = resolveCommonAiFeedbackChunk(chunk, {
        defaultStatus: options?.defaultStatus,
        defaultError: options?.defaultError,
      });
      if (!feedback) return false;

      if (feedback.type === "reasoning") {
        applyAiReasoningUpdate(feedback.update.mode, feedback.update.text);
        return true;
      }

      if (feedback.type === "status") {
        if (options?.onStatus) {
          options.onStatus(feedback.message);
        } else {
          appendAiStatusLog(feedback.message, options?.dedupeHeartbeat);
        }
        return true;
      }

      if (options?.onError) {
        options.onError(feedback.message);
      } else {
        toast.error(feedback.message);
      }
      if (options?.logError) {
        appendAiErrorLog(feedback.message);
      }
      return true;
    },
    [appendAiErrorLog, appendAiStatusLog, applyAiReasoningUpdate, toast],
  );

  const handleDraftLikeChunk = useCallback(
    (chunk: AiProcessChunk, options: DraftLikeChunkHandlerOptions) => {
      switch (chunk.type) {
        case AI_PROCESS_CHUNK_TYPES.text:
          appendStreamingText(chunk.text || "");
          return true;
        case AI_PROCESS_CHUNK_TYPES.formatClear:
          clearQueuedStructuredParagraphs();
          return true;
        case AI_PROCESS_CHUNK_TYPES.structuredParagraph:
          if (!chunk.paragraph) return true;
          resetStreamingText();
          queueStructuredParagraph(chunk.paragraph);
          return true;
        case AI_PROCESS_CHUNK_TYPES.replaceStreamingText:
          resetStreamingText(chunk.text || "");
          appendProcessingLog({
            type: "status",
            message: "内容解析完成，正在渲染…",
            ts: Date.now(),
          });
          return true;
        case AI_PROCESS_CHUNK_TYPES.outline:
          if (!options.onOutline) return false;
          resetStreamingText();
          options.onOutline(chunk.outline_text || "");
          return true;
        case AI_PROCESS_CHUNK_TYPES.done:
          applyAiDoneChunk(chunk, options.stageId);
          return true;
        default:
          return handleCommonAiFeedbackChunk(chunk, {
            onStatus: options.onStatus,
            onError: options.onChunkError,
          });
      }
    },
    [
      appendProcessingLog,
      appendStreamingText,
      applyAiDoneChunk,
      clearQueuedStructuredParagraphs,
      handleCommonAiFeedbackChunk,
      queueStructuredParagraph,
      resetStreamingText,
    ],
  );

  const handleDraftStageChunk = useCallback(
    (chunk: AiProcessChunk, options: DraftStageChunkHandlerOptions) =>
      handleDraftLikeChunk(chunk, {
        stageId: options.stageId,
        onStatus: (message) => {
          if (
            options.toastInvalidParagraphIndex &&
            /无效段落索引/.test(message)
          ) {
            toast(message, { duration: 6000 });
          }
          if (options.onStatus) {
            options.onStatus(message);
            return;
          }
          appendAiStatusLog(message, options.dedupeHeartbeat);
        },
        onChunkError: (message) => {
          if (options.onError) {
            options.onError(message);
          } else {
            toast.error(message);
          }
          if (options.logChunkError) {
            appendAiErrorLog(message);
          }
        },
        onOutline: options.onOutline,
      }),
    [appendAiErrorLog, appendAiStatusLog, handleDraftLikeChunk, toast],
  );

  const handleAiStreamFailure = useCallback(
    (errMsg: string) => {
      if (isAiLockConflictError(errMsg) && currentDoc) {
        const lockMsg = stripAiLockConflictErrorPrefix(errMsg);
        apiReleaseAiLock(currentDoc.id)
          .then(() => {
            toast("已自动释放残留的 AI 处理锁，请重新操作", {
              duration: 5000,
            });
            setAiLockConflict(false);
          })
          .catch(() => {
            toast.error(`${lockMsg}\n点击下方按钮可强制解锁`, {
              duration: 10000,
            });
            setAiLockConflict(true);
          });
        return;
      }
      if (errMsg.includes("已取消")) {
        toast.info(errMsg);
      } else {
        toast.error(errMsg);
      }
    },
    [currentDoc, setAiLockConflict, toast],
  );

  const getExistingParagraphs = useCallback(() => {
    if (aiStructuredParagraphs.length > 0) return aiStructuredParagraphs;
    if (acceptedParagraphs.length > 0) return acceptedParagraphs;
    return undefined;
  }, [acceptedParagraphs, aiStructuredParagraphs]);

  const scrollAiOutputToBottom = useCallback(() => {
    if (aiOutputRef.current) {
      aiOutputRef.current.scrollTop = aiOutputRef.current.scrollHeight;
    }
  }, [aiOutputRef]);

  const markCurrentStageCompleted = useCallback(() => {
    setCompletedStages((prev) => {
      const next = new Set(prev);
      next.add(pipelineStageIndex);
      return next;
    });
  }, [pipelineStageIndex, setCompletedStages]);

  const handleAiProcess = useCallback(() => {
    if (!currentDoc) return toast.error("请先导入文档");
    if (currentStageId !== "format" && currentStageId !== "draft" && !aiInstruction.trim()) {
      return toast.error("请输入处理指令");
    }

    const finalInstruction = buildAiProcessInstruction({
      stageId: currentStageId,
      aiInstruction,
      selectedPreset,
      draftHeadingLevel,
    });

    const existingParas = getExistingParagraphs();
    if (existingParas && existingParas.length > 0 && !currentDoc.content?.trim()) {
      const derivedContent = paragraphsToText(existingParas);
      if (derivedContent) {
        setCurrentDoc((prev) =>
          prev ? { ...prev, content: derivedContent } : prev,
        );
      }
    }

    if (currentStageId === "review" && existingParas && existingParas.length > 0) {
      setAcceptedParagraphs(clearParagraphChangeMarkers(existingParas));
    }

    setIsAiProcessing(true);
    setParagraphPhase("streaming");
    resetStreamingText();
    clearQueuedStructuredParagraphs();
    needsMoreInfoRef.current = false;
    setProcessingLog([]);
    setKbReferences([]);
    setFormatProgress(null);
    setFormatStats(null);
    setOutlineText("");
    setShowOutlinePanel(false);
    flushReasoningText("", true);
    setIsAiThinking(false);

    const abortCtrl = new AbortController();
    aiAbortRef.current = abortCtrl;
    const generation = aiGenerationRef.current;
    let outlineReceived = false;

    void apiAiProcess(
      currentDoc.id,
      currentStageId,
      finalInstruction,
      (chunk: AiProcessChunk) => {
        if (aiGenerationRef.current !== generation) return;
        if (
          handleDraftStageChunk(chunk, {
            stageId: currentStageId,
            dedupeHeartbeat: true,
            logChunkError: true,
            toastInvalidParagraphIndex: true,
            onOutline: (outline) => {
              outlineReceived = true;
              setOutlineText(outline);
              setShowOutlinePanel(true);
              appendProcessingLog({
                type: "info",
                message: "📋 AI 已生成文档大纲，请确认后展开正文",
                ts: Date.now(),
              });
            },
          })
        ) {
          // handled by shared draft-like handler
        } else if (chunk.type === "draft_result" && chunk.paragraphs) {
          resetStreamingText();
          setAiStructuredParagraphs(chunk.paragraphs as StructuredParagraph[]);
          const changeCount = chunk.change_count || 0;
          const summary = chunk.summary || "";
          const message = summary
            ? `AI 完成 ${changeCount} 处变更：${summary}`
            : `AI 完成 ${changeCount} 处变更`;
          appendProcessingLog({ type: "info", message, ts: Date.now() });
          toast.success(message, { duration: 5000 });
        } else if (chunk.type === "needs_more_info") {
          needsMoreInfoRef.current = true;
          resetStreamingText();
          const suggestions = (chunk.suggestions as string[] | undefined) || [];
          const message =
            suggestions.length > 0
              ? "AI 需要更多信息：\n" +
                suggestions.map((item) => `• ${item}`).join("\n")
              : "AI 需要更多信息，请提供更详细的指令";
          toast(message, { duration: 8000 });
          appendProcessingLog({ type: "info", message, ts: Date.now() });
        } else if (chunk.type === "review_suggestion" && chunk.suggestion) {
          setReviewResult((prev) => {
            const existing = isReviewSuggestionSummary(prev)
              ? prev
              : createEmptyReviewSuggestionSummary();
            return {
              ...existing,
              suggestions: [...existing.suggestions, chunk.suggestion],
            };
          });
          const suggestion = chunk.suggestion as ReviewSuggestionItem;
          if (
            suggestion.original &&
            suggestion.suggestion &&
            suggestion.original !== suggestion.suggestion
          ) {
            setAiStructuredParagraphs((prev) => {
              let paragraphs = prev.length > 0 ? [...prev] : undefined;
              let initializedFromAccepted = false;
              if (!paragraphs) {
                const base =
                  acceptedParagraphs.length > 0
                    ? ((initializedFromAccepted = true), acceptedParagraphs)
                    : existingParas && existingParas.length > 0
                      ? existingParas
                      : currentDoc?.content
                        ? currentDoc.content
                            .split(/\n+/)
                            .filter((line) => line.trim())
                            .map((line) => ({
                              text: line.trim(),
                              style_type: "body" as const,
                            }))
                        : [];
                paragraphs = base.map((paragraph) => ({ ...paragraph }));
              }

              let matched = false;
              for (let index = 0; index < paragraphs.length; index += 1) {
                if (
                  paragraphs[index].text.includes(suggestion.original) &&
                  !paragraphs[index]._change
                ) {
                  paragraphs[index] = {
                    ...paragraphs[index],
                    _change: "modified",
                    _original_text: paragraphs[index].text,
                    text: paragraphs[index].text.replace(
                      suggestion.original,
                      suggestion.suggestion,
                    ),
                    _change_reason: `[${suggestion.category}] ${suggestion.reason}`,
                  };
                  matched = true;
                  break;
                }
              }

              if ((matched || prev.length === 0) && initializedFromAccepted) {
                setTimeout(() => setAcceptedParagraphs([]), 0);
              }
              return matched ? paragraphs : prev.length > 0 ? prev : paragraphs;
            });
          }
        } else if (chunk.type === "format_stats") {
          setFormatStats({
            rule_count: chunk.rule_count || 0,
            llm_count: chunk.llm_count || 0,
            high_confidence: chunk.high_confidence || 0,
            low_confidence: chunk.low_confidence || 0,
          });
          const total = (chunk.rule_count || 0) + (chunk.llm_count || 0);
          appendProcessingLog({
            type: "info",
            message: `📊 排版统计：规则引擎处理 ${chunk.rule_count || 0} 段，LLM 处理 ${chunk.llm_count || 0} 段（共 ${total} 段）`,
            ts: Date.now(),
          });
        } else if (chunk.type === "review_suggestions") {
          setReviewResult({
            suggestions:
              (chunk.suggestions as ReviewSuggestionItem[] | undefined) || [],
            summary: chunk.summary || "",
          });
        } else if (chunk.type === "kb_references") {
          const references = chunk.references || [];
          setKbReferences(references);
          if (references.length > 0) {
            const topReference =
              references.find((ref) => ref.type === "full_document") ||
              references[0];
            appendProcessingLog({
              type: "info",
              message: `📚 参考知识库文档：「${topReference.name}」(相关度 ${Math.round(topReference.score * 100)}%)`,
              ts: Date.now(),
            });
          }
        } else if (chunk.type === "format_progress") {
          setFormatProgress({
            current: chunk.current || 0,
            total: chunk.total || 0,
            percent: chunk.percent || 0,
          });
        }

        scrollAiOutputToBottom();
      },
      () => {
        if (aiGenerationRef.current !== generation) return;
        flushPendingParas(true);
        setIsAiProcessing(false);
        setParagraphPhase("preview");
        aiAbortRef.current = null;
        setIsAiThinking(false);

        if (outlineReceived) {
          return;
        }

        if (needsMoreInfoRef.current) {
          needsMoreInfoRef.current = false;
          resetStreamingText();
          return;
        }

        normalizeStreamingText();
        markCurrentStageCompleted();
        setAiStructuredParagraphs((prev) => {
          if (prev.length > 0) {
            pushAiSnapshot(prev);
          }
          return prev;
        });
        void loadDocs();
        setAiInstruction("");
        toast.success(`${currentStageLabel}完成`);
      },
      (errMsg: string) => {
        if (aiGenerationRef.current !== generation) return;
        setIsAiProcessing(false);
        setIsAiThinking(false);
        aiAbortRef.current = null;
        handleAiStreamFailure(errMsg);
      },
      existingParas,
      selectedDraftKbIds.length > 0 ? selectedDraftKbIds : undefined,
      abortCtrl.signal,
      undefined,
      undefined,
      selectedKbFileIds.length > 0 ? selectedKbFileIds : undefined,
      draftHeadingLevel !== -1 ? draftHeadingLevel : undefined,
    );
  }, [
    acceptedParagraphs,
    aiAbortRef,
    aiGenerationRef,
    aiInstruction,
    appendAiStatusLog,
    appendProcessingLog,
    clearQueuedStructuredParagraphs,
    currentDoc,
    currentStageId,
    currentStageLabel,
    draftHeadingLevel,
    flushPendingParas,
    flushReasoningText,
    getExistingParagraphs,
    handleAiStreamFailure,
    handleDraftStageChunk,
    loadDocs,
    markCurrentStageCompleted,
    needsMoreInfoRef,
    normalizeStreamingText,
    paragraphsToText,
    pushAiSnapshot,
    resetStreamingText,
    scrollAiOutputToBottom,
    selectedDraftKbIds,
    selectedKbFileIds,
    selectedPreset,
    setAcceptedParagraphs,
    setAiInstruction,
    setAiStructuredParagraphs,
    setCurrentDoc,
    setFormatProgress,
    setFormatStats,
    setIsAiProcessing,
    setIsAiThinking,
    setKbReferences,
    setOutlineText,
    setParagraphPhase,
    setProcessingLog,
    setReviewResult,
    setShowOutlinePanel,
    toast,
  ]);

  const handleConfirmOutline = useCallback(() => {
    if (!currentDoc || !outlineText.trim()) return;

    setShowOutlinePanel(false);
    setIsAiProcessing(true);
    setParagraphPhase("streaming");
    resetStreamingText();
    clearQueuedStructuredParagraphs();
    setProcessingLog([]);
    flushReasoningText("", true);
    setIsAiThinking(false);
    setFormatStats(null);

    const abortCtrl = new AbortController();
    aiAbortRef.current = abortCtrl;
    const generation = aiGenerationRef.current;
    const outlineInstruction = buildAiProcessInstruction({
      stageId: currentStageId,
      aiInstruction,
      draftHeadingLevel,
      selectedPreset: null,
    });

    void apiAiProcess(
      currentDoc.id,
      currentStageId,
      outlineInstruction,
      (chunk: AiProcessChunk) => {
        if (aiGenerationRef.current !== generation) return;
        handleDraftStageChunk(chunk, {
          stageId: currentStageId,
        });
        scrollAiOutputToBottom();
      },
      () => {
        if (aiGenerationRef.current !== generation) return;
        flushPendingParas(true);
        setIsAiProcessing(false);
        setParagraphPhase("preview");
        aiAbortRef.current = null;
        setIsAiThinking(false);
        markCurrentStageCompleted();
        setAiStructuredParagraphs((prev) => {
          if (prev.length > 0) pushAiSnapshot(prev);
          return prev;
        });
        void loadDocs();
        toast.success("正文起草完成");
      },
      (errMsg: string) => {
        if (aiGenerationRef.current !== generation) return;
        setIsAiProcessing(false);
        setIsAiThinking(false);
        aiAbortRef.current = null;
        handleAiStreamFailure(errMsg);
      },
      undefined,
      selectedDraftKbIds.length > 0 ? selectedDraftKbIds : undefined,
      abortCtrl.signal,
      outlineText,
      undefined,
      selectedKbFileIds.length > 0 ? selectedKbFileIds : undefined,
      draftHeadingLevel !== -1 ? draftHeadingLevel : undefined,
    );
  }, [
    aiAbortRef,
    aiGenerationRef,
    aiInstruction,
    appendProcessingLog,
    clearQueuedStructuredParagraphs,
    currentDoc,
    currentStageId,
    draftHeadingLevel,
    flushPendingParas,
    flushReasoningText,
    handleAiStreamFailure,
    handleDraftStageChunk,
    loadDocs,
    markCurrentStageCompleted,
    outlineText,
    pushAiSnapshot,
    resetStreamingText,
    scrollAiOutputToBottom,
    selectedDraftKbIds,
    selectedKbFileIds,
    setAiStructuredParagraphs,
    setFormatStats,
    setIsAiProcessing,
    setIsAiThinking,
    setParagraphPhase,
    setProcessingLog,
    setShowOutlinePanel,
    toast,
  ]);

  const handleFormatSuggest = useCallback(() => {
    if (!currentDoc) return toast.error("请先导入文档");
    if (!currentDoc.content?.trim()) return toast.error("文档内容为空");

    setIsFormatSuggesting(true);
    setFormatSuggestions([]);
    setFormatSuggestResult(null);
    setFormatSuggestParas([]);
    setShowFormatSuggestPanel(true);
    flushReasoningText("", true);
    setIsAiThinking(false);

    const existingParas = getExistingParagraphs();
    const generation = aiGenerationRef.current;

    void apiAiProcess(
      currentDoc.id,
      "format_suggest",
      aiInstruction.trim() || "请分析文档并给出详细的排版建议",
      (chunk: AiProcessChunk) => {
        if (aiGenerationRef.current !== generation) return;
        if (chunk.type === "format_suggestion" && chunk.suggestion) {
          const suggestion = chunk.suggestion as FormatSuggestionItem & {
            index: number;
          };
          setFormatSuggestions((prev) => [...prev, suggestion]);
        } else if (chunk.type === "format_suggest_result") {
          const data = chunk.data as FormatSuggestResult | undefined;
          if (data) {
            setFormatSuggestResult(data);
            setFormatSuggestions(data.suggestions || []);
          }
        } else if (chunk.type === "format_suggest_paragraphs") {
          const paragraphs = chunk.paragraphs as StructuredParagraph[] | undefined;
          if (paragraphs && paragraphs.length > 0) {
            setFormatSuggestParas(paragraphs);
            const changeCount = chunk.change_count || 0;
            appendProcessingLog({
              type: "info",
              message: `规则引擎预览：${changeCount} 段有排版变更，可一键应用`,
              ts: Date.now(),
            });
          }
        } else {
          handleCommonAiFeedbackChunk(chunk, {
            defaultStatus: "分析中…",
            defaultError: "排版建议生成出错",
          });
        }
      },
      () => {
        if (aiGenerationRef.current !== generation) return;
        setIsFormatSuggesting(false);
        setIsAiThinking(false);
        toast.success("排版建议生成完成");
      },
      (errMsg: string) => {
        if (aiGenerationRef.current !== generation) return;
        setIsFormatSuggesting(false);
        setIsAiThinking(false);
        handleAiStreamFailure(errMsg);
      },
      existingParas,
    );
  }, [
    aiGenerationRef,
    aiInstruction,
    currentDoc,
    flushReasoningText,
    getExistingParagraphs,
    handleCommonAiFeedbackChunk,
    handleAiStreamFailure,
    setFormatSuggestParas,
    setFormatSuggestResult,
    setFormatSuggestions,
    setIsAiThinking,
    setIsFormatSuggesting,
    setShowFormatSuggestPanel,
    toast,
  ]);

  return {
    handleAiProcess,
    handleConfirmOutline,
    handleFormatSuggest,
  };
}

export function normalizeCurrentStreamingText(content: string): string {
  return normalizeAiStreamingResult(content);
}
