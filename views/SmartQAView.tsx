import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  MessageSquare,
  Database,
  Check,
  ChevronDown,
  MessageCircle,
  BrainCircuit,
  Network,
  BookOpen,
  Save,
  Loader2,
  X,
  Activity,
  Quote,
  Send,
  Trash2,
  Plus,
  FileText,
  ExternalLink,
  AlertTriangle,
  StopCircle,
  GitBranch,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EmptyState, Modal, useConfirm } from "../components/ui";
import {
  apiListSessions,
  apiCreateSession,
  apiGetSession,
  apiUpdateSession,
  apiDeleteSession,
  apiSendMessage,
  apiListCollections,
  apiSaveQaPair,
  apiGetFileMarkdown,
  type ChatSession,
  type ChatMessage,
  type KBCollection,
  type SSECallbacks,
  type ReasoningStep,
} from "../api";
import { PERMISSIONS } from "../constants";

/* ── 前端运行时消息（合并后端持久化 + 流式增量） ── */
interface RuntimeMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  citations?: any[];
  reasoning?: string;
  reasoningSteps?: ReasoningStep[];
  knowledgeGraph?: any[];
  created_at: string;
  isStreaming?: boolean;
}

export const SmartQAView = ({
  toast,
  currentUser,
  onNavigateToGraph,
}: {
  toast: any;
  currentUser?: any;
  onNavigateToGraph: (info: { sourceName: string; targetName: string; relation: string }) => void;
}) => {
  const canSaveToQa = currentUser?.permissions?.includes(
    PERMISSIONS.RES_QA_FEEDBACK,
  );
  const { confirm, ConfirmDialog } = useConfirm();
  /* ═══════════ State ═══════════ */
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<RuntimeMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [citationDrawer, setCitationDrawer] = useState<any>(null);
  const [kbCollections, setKbCollections] = useState<KBCollection[]>([]);
  const [expandedReasoning, setExpandedReasoning] = useState<
    Record<string, boolean>
  >({});
  const [showKbSelect, setShowKbSelect] = useState(false);
  const [quoteText, setQuoteText] = useState<string | null>(null);
  const [editingQa, setEditingQa] = useState<{
    question: string;
    answer: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [sourcePreview, setSourcePreview] = useState<{
    title: string;
    markdown: string;
  } | null>(null);
  const [sourcePreviewLoading, setSourcePreviewLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeSession = sessions.find((s) => s.id === activeId) || null;

  /* ═══════════ Effects ═══════════ */

  // 初始化
  useEffect(() => {
    loadSessions();
    loadCollections();
  }, []);

  // 切换会话 → 加载消息
  useEffect(() => {
    if (activeId) loadMessages(activeId);
    else setMessages([]);
  }, [activeId]);

  // 新消息自动滚底
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // 文本选中 → 引用
  useEffect(() => {
    const handleMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      if (chatContainerRef.current?.contains(sel.anchorNode)) {
        const text = sel.toString().trim();
        if (text) setQuoteText(text);
      }
    };
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, []);

  /* ═══════════ 数据加载 ═══════════ */

  const loadSessions = async () => {
    try {
      const data = await apiListSessions(1, 100);
      setSessions(data.items);
      if (data.items.length > 0 && !activeId) setActiveId(data.items[0].id);
    } catch (err: any) {
      if (err.message === "TOKEN_EXPIRED") {
        toast.error("登录已过期");
        return;
      }
      toast.error("加载会话失败: " + err.message);
    }
  };

  const loadCollections = async () => {
    try {
      const items = await apiListCollections();
      setKbCollections(items);
    } catch {
      /* 不阻断 */
    }
  };

  const loadMessages = async (sid: string) => {
    try {
      setLoading(true);
      const detail = await apiGetSession(sid);
      setMessages(
        (detail.messages || []).map((m) => ({
          id: m.id,
          session_id: m.session_id,
          role: m.role,
          content: m.content,
          citations: m.citations,
          reasoning: m.reasoning,
          knowledgeGraph: m.knowledge_graph_data,
          created_at: m.created_at,
        })),
      );
    } catch (err: any) {
      if (err.message !== "TOKEN_EXPIRED") toast.error("加载消息失败");
    } finally {
      setLoading(false);
    }
  };

  /* ═══════════ 会话 CRUD ═══════════ */

  const createSession = async () => {
    try {
      const defaultKbIds =
        kbCollections.length > 0 ? [kbCollections[0].id] : [];
      const res = await apiCreateSession({
        title: "新会话",
        kb_collection_ids: defaultKbIds,
        qa_ref_enabled: true,
      });
      await loadSessions();
      setActiveId(res.id);
    } catch (err: any) {
      toast.error("创建失败: " + err.message);
    }
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (
      !(await confirm({
        message: "确定删除此会话？",
        variant: "danger",
        confirmText: "删除",
      }))
    )
      return;
    try {
      await apiDeleteSession(id);
      const rest = sessions.filter((s) => s.id !== id);
      setSessions(rest);
      if (activeId === id) setActiveId(rest[0]?.id || null);
    } catch (err: any) {
      toast.error("删除失败: " + err.message);
    }
  };

  const toggleKb = async (kbId: string) => {
    if (!activeSession) return;
    let newKbIds = [...(activeSession.kb_collection_ids || [])];
    let newQaRef = activeSession.qa_ref_enabled;

    if (kbId === "SYSTEM_QA_BANK") {
      newQaRef = !newQaRef;
    } else {
      newKbIds = newKbIds.includes(kbId)
        ? newKbIds.filter((id) => id !== kbId)
        : [...newKbIds, kbId];
    }

    try {
      await apiUpdateSession(activeSession.id, {
        kb_collection_ids: newKbIds,
        qa_ref_enabled: newQaRef,
      });
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? { ...s, kb_collection_ids: newKbIds, qa_ref_enabled: newQaRef }
            : s,
        ),
      );
    } catch (err: any) {
      toast.error("更新失败: " + err.message);
    }
  };

  /* ═══════════ 发送消息 (SSE 流式) ═══════════ */

  const handleSend = useCallback(async () => {
    if (!input.trim() || !activeId || isStreaming) return;

    const content = input.trim();
    const quote = quoteText;
    const finalContent = quote ? `> ${quote}\n\n${content}` : content;

    setInput("");
    setQuoteText(null);
    setIsStreaming(true);

    // 本地追加用户消息
    const userMsgId = `temp_u_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        session_id: activeId,
        role: "user",
        content: finalContent,
        created_at: new Date().toISOString(),
      },
    ]);

    // 首条消息 → 更新标题
    if (messages.length === 0) {
      const title = content.slice(0, 20);
      apiUpdateSession(activeId, { title }).catch(() => {});
      setSessions((prev) =>
        prev.map((s) => (s.id === activeId ? { ...s, title } : s)),
      );
    }

    // AI 占位
    const aiMsgId = `temp_a_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: aiMsgId,
        session_id: activeId,
        role: "assistant",
        content: "",
        reasoningSteps: [],
        created_at: new Date().toISOString(),
        isStreaming: true,
      },
    ]);

    // 自动展开推理步骤（流式过程中）
    setExpandedReasoning((prev) => ({ ...prev, [aiMsgId]: true }));

    const ac = new AbortController();
    abortRef.current = ac;

    const cbs: SSECallbacks = {
      onTextChunk: (text) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId ? { ...m, content: m.content + text } : m,
          ),
        );
      },
      onCitations: (citations) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? { ...m, citations } : m)),
        );
      },
      onReasoning: (text, steps) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  reasoning: text,
                  reasoningSteps: steps || m.reasoningSteps,
                }
              : m,
          ),
        );
      },
      onReasoningStep: (step) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== aiMsgId) return m;
            const existing = m.reasoningSteps || [];
            // 替换同 step 号的条目（running → completed）或追加
            const idx = existing.findIndex((s) => s.step === step.step);
            const updated =
              idx >= 0
                ? existing.map((s, i) => (i === idx ? step : s))
                : [...existing, step];
            return { ...m, reasoningSteps: updated };
          }),
        );
      },
      onKnowledgeGraph: (data) => {
        const triples = data.triples || [];
        if (triples.length)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId ? { ...m, knowledgeGraph: triples } : m,
            ),
          );
      },
      onEnd: () => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId ? { ...m, isStreaming: false } : m,
          ),
        );
        setIsStreaming(false);
        abortRef.current = null;
        loadSessions();
        // 流式结束后默认收起推理步骤（用户可手动展开）
        setExpandedReasoning((prev) => ({ ...prev, [aiMsgId]: false }));
      },
      onWarning: (keywords) =>
        toast.info(`⚠️ 包含敏感词: ${keywords.join("、")}`),
      onError: (msg) => {
        toast.error(`问答出错: ${msg}`);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: m.content || `❌ ${msg}`, isStreaming: false }
              : m,
          ),
        );
        setIsStreaming(false);
        abortRef.current = null;
      },
      onQaMatch: () => {
        // QA 匹配现在走 SSE 流式，不再走 JSON 回包
        setIsStreaming(false);
        abortRef.current = null;
      },
    };

    try {
      await apiSendMessage(
        activeId,
        content,
        quote || undefined,
        cbs,
        ac.signal,
      );
    } catch (err: any) {
      if (err.name !== "AbortError") cbs.onError?.(err.message);
    }
  }, [input, activeId, isStreaming, quoteText, messages.length]);

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
    );
  };

  /* ═══════════ QA 回流 ═══════════ */

  const handleSaveToQa = async (d: {
    question: string;
    answer: string;
    category: string;
  }) => {
    try {
      await apiSaveQaPair({
        question: d.question,
        answer: d.answer,
        category: d.category,
        source_type: "chat_feedback",
        source_session_id: activeId || undefined,
      });
      toast.success("已成功保存至QA库");
      setEditingQa(null);
    } catch (err: any) {
      toast.error("保存失败: " + err.message);
    }
  };

  const kbCount = activeSession
    ? (activeSession.kb_collection_ids?.length || 0) +
      (activeSession.qa_ref_enabled ? 1 : 0)
    : 0;

  /* ═══════════ 子组件 ═══════════ */

  const QaModal = ({
    initialQ,
    initialA,
    onSave,
    onClose,
  }: {
    initialQ: string;
    initialA: string;
    onSave: (d: { question: string; answer: string; category: string }) => void;
    onClose: () => void;
  }) => {
    const [q, setQ] = useState(initialQ);
    const [a, setA] = useState(initialA);
    const [cat, setCat] = useState("Chat Feedback");
    return (
      <Modal
        title="存入智能QA库"
        onClose={onClose}
        footer={
          <button
            onClick={() => onSave({ question: q, answer: a, category: cat })}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            保存
          </button>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              问题
            </label>
            <textarea
              className="w-full border rounded p-2 text-sm h-20"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              答案
            </label>
            <textarea
              className="w-full border rounded p-2 text-sm h-32"
              value={a}
              onChange={(e) => setA(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              分类
            </label>
            <input
              className="w-full border rounded p-2 text-sm"
              value={cat}
              onChange={(e) => setCat(e.target.value)}
            />
          </div>
          <div className="bg-yellow-50 p-2 rounded text-xs text-yellow-700 flex items-center">
            <AlertTriangle size={12} className="mr-1" />{" "}
            保存后，该问答对将在后续问答中被优先检索。
          </div>
        </div>
      </Modal>
    );
  };

  /* ═══════════ JSX ═══════════ */
  return (
    <div className="flex h-full gap-4 relative">
      {/* ── 会话侧栏 ── */}
      <div className="w-64 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <span className="font-bold text-gray-700">历史会话</span>
          <button
            onClick={createSession}
            className="p-1 hover:bg-gray-200 rounded"
            title="新建会话"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={`group p-3 rounded-lg text-sm cursor-pointer flex justify-between items-center ${activeId === s.id ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200" : "hover:bg-gray-50 text-gray-700"}`}
            >
              <span className="truncate flex-1">{s.title}</span>
              <Trash2
                size={14}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                onClick={(e) => deleteSession(e, s.id)}
              />
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-8">
              暂无会话
            </div>
          )}
        </div>
      </div>

      {/* ── 主聊天区 ── */}
      <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col relative overflow-hidden">
        {activeSession ? (
          <>
            {/* 顶栏 */}
            <div className="h-14 border-b flex items-center justify-between px-6 bg-slate-50">
              <div className="flex flex-col">
                <div className="font-bold text-gray-700 truncate max-w-md text-sm">
                  {activeSession.title}
                </div>
                <div className="text-[10px] text-gray-500 flex items-center">
                  <Activity size={10} className="mr-1 text-green-500" /> RAG
                  增强检索
                </div>
              </div>
              <div className="flex items-center space-x-2 relative">
                <button
                  onClick={() => setShowKbSelect(!showKbSelect)}
                  className="flex items-center text-xs border rounded px-3 py-1.5 bg-white hover:bg-gray-50 transition-colors"
                >
                  <Database size={12} className="mr-2 text-blue-600" />
                  <span>
                    {kbCount > 0 ? `已选 ${kbCount} 个知识源` : "选择知识库"}
                  </span>
                  <ChevronDown size={12} className="ml-2 text-gray-400" />
                </button>
                {showKbSelect && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowKbSelect(false)}
                    />
                    <div className="absolute top-full right-0 mt-2 w-56 bg-white border rounded-lg shadow-xl z-20 p-2 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="text-xs font-bold text-gray-500 px-2 py-1 mb-1">
                        结构化知识
                      </div>
                      <div
                        className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer"
                        onClick={() => toggleKb("SYSTEM_QA_BANK")}
                      >
                        <div
                          className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${activeSession.qa_ref_enabled ? "bg-purple-600 border-purple-600" : "border-gray-300"}`}
                        >
                          {activeSession.qa_ref_enabled && (
                            <Check size={10} className="text-white" />
                          )}
                        </div>
                        <span className="text-sm text-gray-700 flex items-center">
                          <MessageCircle
                            size={12}
                            className="mr-1 text-purple-500"
                          />{" "}
                          智能QA库
                        </span>
                      </div>
                      <div className="text-xs font-bold text-gray-500 px-2 py-1 mt-2 mb-1">
                        文档集合
                      </div>
                      {kbCollections.map((kb) => (
                        <div
                          key={kb.id}
                          className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer"
                          onClick={() => toggleKb(kb.id)}
                        >
                          <div
                            className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${(activeSession.kb_collection_ids || []).includes(kb.id) ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}
                          >
                            {(activeSession.kb_collection_ids || []).includes(
                              kb.id,
                            ) && <Check size={10} className="text-white" />}
                          </div>
                          <span className="text-sm text-gray-700">
                            {kb.name}
                          </span>
                        </div>
                      ))}
                      {kbCollections.length === 0 && (
                        <div className="p-2 text-xs text-gray-400 text-center">
                          暂无可用知识库
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 消息列表 */}
            <div
              className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/50"
              ref={chatContainerRef}
            >
              {loading && messages.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  <Loader2 className="animate-spin mx-auto mb-2" size={20} />{" "}
                  加载中...
                </div>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${m.role === "user" ? "bg-blue-600 text-white rounded-tr-none" : "bg-white border border-gray-200 rounded-tl-none"}`}
                  >
                    {/* 推理步骤时间线 */}
                    {m.role === "assistant" &&
                      (m.reasoningSteps?.length || m.reasoning) && (
                        <div className="mb-3 border-b border-gray-100 pb-2">
                          <div
                            className="flex items-center text-xs text-orange-600 cursor-pointer hover:text-orange-700 font-medium"
                            onClick={() =>
                              setExpandedReasoning((prev) => ({
                                ...prev,
                                [m.id]: !prev[m.id],
                              }))
                            }
                          >
                            <BrainCircuit size={12} className="mr-1.5" />
                            {expandedReasoning[m.id]
                              ? "收起推理过程"
                              : "查看推理过程"}
                            <ChevronDown
                              size={12}
                              className={`ml-1 transition-transform ${expandedReasoning[m.id] ? "rotate-180" : ""}`}
                            />
                          </div>
                          {expandedReasoning[m.id] && (
                            <div className="mt-2 bg-gradient-to-br from-orange-50 to-amber-50 p-3 rounded-lg border border-orange-100">
                              {m.reasoningSteps &&
                              m.reasoningSteps.length > 0 ? (
                                <div className="space-y-2">
                                  {m.reasoningSteps.map((s) => (
                                    <div
                                      key={s.step}
                                      className="flex items-start gap-2"
                                    >
                                      <div className="flex-shrink-0 mt-0.5">
                                        {s.status === "completed" ? (
                                          <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                                            <Check
                                              size={10}
                                              className="text-white"
                                            />
                                          </div>
                                        ) : (
                                          <div className="w-5 h-5 rounded-full bg-orange-400 flex items-center justify-center">
                                            <Loader2
                                              size={10}
                                              className="text-white animate-spin"
                                            />
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-bold text-gray-700">
                                            Step {s.step}: {s.title}
                                          </span>
                                          {s.elapsed != null &&
                                            s.status === "completed" && (
                                              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                                {s.elapsed}s
                                              </span>
                                            )}
                                          {s.hit !== undefined && (
                                            <span
                                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${s.hit ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                                            >
                                              {s.hit ? "✓ 命中" : "未命中"}
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                                          {s.detail}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : m.reasoning ? (
                                <div className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed font-mono">
                                  {m.reasoning}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      )}
                    {/* 正文 */}
                    {m.role === "user" ? (
                      <div className="whitespace-pre-wrap text-sm leading-relaxed selection:bg-yellow-200 selection:text-black">
                        {m.content.startsWith("> ") ? (
                          <>
                            <div className="border-l-4 border-white/50 pl-3 py-1 mb-2 text-white/80 italic text-xs bg-black/10 rounded-r">
                              {m.content.split("\n\n")[0].substring(2)}
                            </div>
                            <div>
                              {m.content.substring(
                                m.content.indexOf("\n\n") + 2,
                              )}
                            </div>
                          </>
                        ) : (
                          m.content
                        )}
                      </div>
                    ) : (
                      <div className="text-sm leading-relaxed selection:bg-yellow-200 selection:text-black govai-markdown">
                        <Markdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({ children }) => (
                              <h1 className="text-lg font-bold text-gray-900 mt-4 mb-2 pb-1 border-b border-gray-200">
                                {children}
                              </h1>
                            ),
                            h2: ({ children }) => (
                              <h2 className="text-base font-bold text-gray-800 mt-3 mb-1.5">
                                {children}
                              </h2>
                            ),
                            h3: ({ children }) => (
                              <h3 className="text-sm font-bold text-gray-700 mt-2 mb-1">
                                {children}
                              </h3>
                            ),
                            h4: ({ children }) => (
                              <h4 className="text-sm font-semibold text-gray-700 mt-2 mb-1">
                                {children}
                              </h4>
                            ),
                            p: ({ children }) => (
                              <p className="mb-2 last:mb-0 leading-relaxed">
                                {children}
                              </p>
                            ),
                            ul: ({ children }) => (
                              <ul className="list-disc list-outside ml-5 mb-2 space-y-0.5">
                                {children}
                              </ul>
                            ),
                            ol: ({ children }) => (
                              <ol className="list-decimal list-outside ml-5 mb-2 space-y-0.5">
                                {children}
                              </ol>
                            ),
                            li: ({ children }) => (
                              <li className="leading-relaxed pl-0.5">
                                {children}
                              </li>
                            ),
                            strong: ({ children }) => (
                              <strong className="font-bold text-gray-900">
                                {children}
                              </strong>
                            ),
                            em: ({ children }) => (
                              <em className="italic text-gray-700">
                                {children}
                              </em>
                            ),
                            blockquote: ({ children }) => (
                              <blockquote className="border-l-3 border-blue-300 bg-blue-50/60 pl-3 py-1.5 my-2 rounded-r text-gray-700 text-[13px]">
                                {children}
                              </blockquote>
                            ),
                            code: ({ className, children }) => {
                              const isBlock = className?.includes("language-");
                              return isBlock ? (
                                <pre className="bg-gray-800 text-gray-100 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono">
                                  <code>{children}</code>
                                </pre>
                              ) : (
                                <code className="bg-gray-100 text-red-600 rounded px-1.5 py-0.5 text-[12px] font-mono">
                                  {children}
                                </code>
                              );
                            },
                            table: ({ children }) => (
                              <div className="overflow-x-auto my-2 rounded border border-gray-200">
                                <table className="min-w-full text-xs">
                                  {children}
                                </table>
                              </div>
                            ),
                            thead: ({ children }) => (
                              <thead className="bg-gray-50 text-gray-600 font-semibold">
                                {children}
                              </thead>
                            ),
                            th: ({ children }) => (
                              <th className="px-3 py-1.5 text-left border-b border-gray-200">
                                {children}
                              </th>
                            ),
                            td: ({ children }) => (
                              <td className="px-3 py-1.5 border-b border-gray-100">
                                {children}
                              </td>
                            ),
                            hr: () => <hr className="my-3 border-gray-200" />,
                            a: ({ href, children }) => (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
                              >
                                {children}
                              </a>
                            ),
                          }}
                        >
                          {m.content}
                        </Markdown>
                        {m.isStreaming && (
                          <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5 rounded-sm" />
                        )}
                      </div>
                    )}
                    {/* 引文 + 知识图谱 + QA回流 */}
                    {(m.citations || m.knowledgeGraph) &&
                      m.role === "assistant" &&
                      !m.isStreaming && (
                        <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col gap-3">
                          {/* ── 知识图谱三元组卡片 ── */}
                          {m.knowledgeGraph && m.knowledgeGraph.length > 0 && (
                            <div>
                              <div className="flex items-center mb-2">
                                <Network
                                  size={14}
                                  className="mr-1.5 text-emerald-600"
                                />
                                <span className="text-xs font-bold text-emerald-700">
                                  知识图谱关联 ({m.knowledgeGraph.length} 条)
                                </span>
                              </div>
                              <div className="grid grid-cols-1 gap-1.5">
                                {m.knowledgeGraph.map((kg: any, i: number) => (
                                  <div
                                    key={i}
                                    onClick={() => onNavigateToGraph({ sourceName: kg.source, targetName: kg.target, relation: kg.relation })}
                                    className="kg-triple-card flex items-center text-xs bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/60 rounded-lg px-3 py-2 cursor-pointer hover:border-emerald-300"
                                    title="点击跳转到知识图谱"
                                  >
                                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                      <span className="inline-flex items-center bg-white border border-emerald-200 text-emerald-800 font-bold px-2 py-0.5 rounded-md shadow-sm truncate max-w-[140px]">
                                        {kg.source}
                                      </span>
                                      {kg.source_type && (
                                        <span className="text-[9px] text-emerald-500 bg-emerald-100 px-1 py-0.5 rounded hidden sm:inline">
                                          {kg.source_type}
                                        </span>
                                      )}
                                      <div className="flex items-center text-emerald-400 flex-shrink-0">
                                        <div className="w-4 h-px bg-emerald-300" />
                                        <span className="mx-1 font-medium text-emerald-600 bg-emerald-100/80 px-1.5 py-0.5 rounded text-[10px]">
                                          {kg.relation}
                                        </span>
                                        <div className="w-3 h-px bg-emerald-300" />
                                        <span className="text-emerald-400">
                                          →
                                        </span>
                                      </div>
                                      <span className="inline-flex items-center bg-white border border-teal-200 text-teal-800 font-bold px-2 py-0.5 rounded-md shadow-sm truncate max-w-[140px]">
                                        {kg.target}
                                      </span>
                                      {kg.target_type && (
                                        <span className="text-[9px] text-teal-500 bg-teal-100 px-1 py-0.5 rounded hidden sm:inline">
                                          {kg.target_type}
                                        </span>
                                      )}
                                    </div>
                                    <ExternalLink
                                      size={10}
                                      className="ml-2 text-emerald-400 flex-shrink-0"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {m.citations && m.citations.length > 0 && (
                            <div>
                              <div className="flex items-center mb-1.5">
                                <BookOpen
                                  size={12}
                                  className="mr-1 text-blue-500"
                                />
                                <span className="text-[10px] font-bold text-gray-500">
                                  参考来源 ({m.citations.length})
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {m.citations.map((c: any, i: number) => (
                                  <button
                                    key={i}
                                    onClick={() =>
                                      c.type === "graph"
                                        ? onNavigateToGraph({ sourceName: c.source_name || "", targetName: c.target_name || "", relation: c.relation || "" })
                                        : setCitationDrawer(c)
                                    }
                                    className={`text-[10px] border rounded-lg px-2.5 py-1.5 flex items-center transition-all hover:shadow-sm ${
                                      c.type === "qa"
                                        ? "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                                        : c.type === "graph"
                                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                          : "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-100"
                                    }`}
                                    title={
                                      c.type === "graph"
                                        ? "点击跳转到知识图谱"
                                        : c.type === "qa"
                                          ? "QA 问答库匹配"
                                          : "点击查看引用详情"
                                    }
                                  >
                                    {c.type === "qa" ? (
                                      <MessageCircle
                                        size={10}
                                        className="mr-1"
                                      />
                                    ) : c.type === "graph" ? (
                                      <GitBranch size={10} className="mr-1" />
                                    ) : (
                                      <BookOpen size={10} className="mr-1" />
                                    )}
                                    {c.type === "graph" ? (
                                      <span>
                                        {c.source_name || c.source_id}→
                                        {c.relation}→
                                        {c.target_name || c.target_id}
                                      </span>
                                    ) : (
                                      c.title
                                    )}
                                    {c.score != null && (
                                      <span className="ml-1 text-gray-400">
                                        ({(c.score * 100).toFixed(0)}%)
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {canSaveToQa && (
                            <div className="flex justify-end mt-1">
                              <button
                                onClick={() => {
                                  const idx = messages.findIndex(
                                    (msg) => msg.id === m.id,
                                  );
                                  const userQ = messages
                                    .slice(0, idx)
                                    .reverse()
                                    .find((msg) => msg.role === "user");
                                  setEditingQa({
                                    question:
                                      userQ?.content.replace(
                                        /^> .*?\n\n/s,
                                        "",
                                      ) || "",
                                    answer: m.content,
                                  });
                                }}
                                className="text-[10px] text-gray-400 hover:text-blue-600 flex items-center transition-colors"
                              >
                                <Save size={12} className="mr-1" /> 存入QA库
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              ))}
              {isStreaming && !messages.some((m) => m.isStreaming) && (
                <div className="text-gray-400 text-sm italic ml-4 flex items-center">
                  <Loader2 className="animate-spin mr-2" size={14} />{" "}
                  正在分析意图并检索知识库...
                </div>
              )}
            </div>

            {/* 输入区 */}
            <div className="p-4 bg-white border-t">
              {quoteText && (
                <div className="mb-2 p-3 bg-gray-50 border-l-4 border-blue-500 rounded-r-lg flex justify-between items-start animate-in slide-in-from-bottom-2">
                  <div className="flex-1 mr-4">
                    <div className="flex items-center text-xs font-bold text-gray-500 mb-1">
                      <Quote size={12} className="mr-1" /> 引用内容
                    </div>
                    <div className="text-sm text-gray-800 line-clamp-3 italic">
                      "{quoteText}"
                    </div>
                  </div>
                  <button
                    onClick={() => setQuoteText(null)}
                    className="text-gray-400 hover:text-red-500 p-1 hover:bg-gray-200 rounded transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <div className="relative">
                <input
                  className="w-full pl-4 pr-14 py-3 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder={
                    quoteText
                      ? "请输入针对引用内容的追问..."
                      : kbCount > 0
                        ? `正在向 ${kbCount} 个知识库提问...`
                        : "请输入问题..."
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !e.shiftKey && handleSend()
                  }
                  disabled={isStreaming}
                />
                <div className="absolute right-3 top-3 flex items-center gap-1">
                  {isStreaming ? (
                    <button
                      onClick={handleStop}
                      className="text-red-500 hover:text-red-600"
                      title="停止生成"
                    >
                      <StopCircle size={20} />
                    </button>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={!input.trim()}
                      className="text-blue-600 hover:text-blue-700 disabled:opacity-50"
                    >
                      <Send size={20} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            icon={MessageSquare}
            title="暂无会话"
            desc="请点击左侧 + 号新建会话开始问答"
            action={
              <button
                onClick={createSession}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
              >
                新建会话
              </button>
            }
          />
        )}

        {/* 引用详情抽屉 */}
        {citationDrawer && (
          <div className="absolute inset-y-0 right-0 w-80 bg-white shadow-2xl border-l border-gray-200 z-10 flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800">引用详情</h3>
              <button onClick={() => setCitationDrawer(null)}>
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto">
              <div className="mb-4">
                <div className="text-xs text-gray-500 mb-1">来源</div>
                <div className="font-bold text-blue-700 flex items-center">
                  {citationDrawer.type === "qa" ? (
                    <MessageCircle size={14} className="mr-1" />
                  ) : citationDrawer.type === "graph" ? (
                    <GitBranch size={14} className="mr-1 text-emerald-600" />
                  ) : (
                    <FileText size={14} className="mr-1" />
                  )}
                  {citationDrawer.title}
                </div>
                {citationDrawer.type === "graph" && (
                  <div className="mt-2 p-2 bg-emerald-50 rounded border border-emerald-100">
                    <div className="flex items-center gap-2 text-xs text-emerald-800">
                      <span className="bg-emerald-100 px-1.5 py-0.5 rounded font-bold">
                        {citationDrawer.source_name || citationDrawer.source_id}
                        {citationDrawer.source_type && (
                          <span className="text-emerald-500 font-normal ml-0.5">
                            ({citationDrawer.source_type})
                          </span>
                        )}
                      </span>
                      <span className="text-emerald-400">
                        —{citationDrawer.relation}→
                      </span>
                      <span className="bg-emerald-100 px-1.5 py-0.5 rounded font-bold">
                        {citationDrawer.target_name || citationDrawer.target_id}
                        {citationDrawer.target_type && (
                          <span className="text-emerald-500 font-normal ml-0.5">
                            ({citationDrawer.target_type})
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )}
                {citationDrawer.dataset_name && (
                  <div className="text-xs text-gray-400 mt-1">
                    知识库: {citationDrawer.dataset_name}
                  </div>
                )}
                {citationDrawer.collection_id && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    集合 ID: {citationDrawer.collection_id}
                  </div>
                )}
              </div>
              {citationDrawer.answer && (
                <div className="mb-4">
                  <div className="text-xs text-gray-500 mb-1">标准答案</div>
                  <div className="bg-green-50 p-3 rounded border border-green-100 text-sm text-gray-700 leading-relaxed">
                    {citationDrawer.answer}
                  </div>
                </div>
              )}
              <div className="bg-yellow-50 p-3 rounded border border-yellow-100 text-sm text-gray-700 leading-relaxed italic relative">
                <span className="absolute top-0 left-0 text-4xl text-yellow-200 font-serif leading-none ml-1">
                  "
                </span>
                <div className="relative z-10">{citationDrawer.quote}</div>
                {citationDrawer.page && (
                  <div className="mt-2 text-right text-xs text-gray-400">
                    Page {citationDrawer.page}
                  </div>
                )}
              </div>
              {citationDrawer.score != null && (
                <div className="mt-3 text-xs text-gray-500">
                  相关度:{" "}
                  <span className="font-bold text-blue-600">
                    {(citationDrawer.score * 100).toFixed(1)}%
                  </span>
                </div>
              )}
              {citationDrawer.type === "graph" ? (
                <button
                  onClick={() => {
                    onNavigateToGraph({ sourceName: citationDrawer.source_name || "", targetName: citationDrawer.target_name || "", relation: citationDrawer.relation || "" });
                    setCitationDrawer(null);
                  }}
                  className="w-full mt-6 flex items-center justify-center py-2 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 text-sm text-emerald-700 font-medium"
                >
                  <Network size={14} className="mr-2" /> 跳转到知识图谱
                </button>
              ) : citationDrawer.type !== "qa" ? (
                <button
                  onClick={async () => {
                    const fileId = citationDrawer.file_id;
                    if (!fileId) {
                      toast.error("未找到关联的本地文件，无法打开原文");
                      return;
                    }
                    setSourcePreviewLoading(true);
                    try {
                      const d = await apiGetFileMarkdown(fileId);
                      setSourcePreview({
                        title: d.file_name || citationDrawer.title,
                        markdown: d.markdown,
                      });
                    } catch {
                      toast.error("加载原文失败");
                    } finally {
                      setSourcePreviewLoading(false);
                    }
                  }}
                  disabled={sourcePreviewLoading}
                  className="w-full mt-6 flex items-center justify-center py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm text-gray-600"
                >
                  {sourcePreviewLoading ? (
                    <Loader2 size={14} className="mr-2 animate-spin" />
                  ) : (
                    <ExternalLink size={14} className="mr-2" />
                  )}
                  打开原文
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* QA 保存弹窗 */}
      {editingQa && (
        <QaModal
          initialQ={editingQa.question}
          initialA={editingQa.answer}
          onSave={handleSaveToQa}
          onClose={() => setEditingQa(null)}
        />
      )}
      {ConfirmDialog}

      {/* 原文预览弹窗 */}
      {sourcePreview && (
        <Modal
          title={
            <div className="flex items-center">
              <FileText size={16} className="mr-2 text-blue-500" />
              <span>{sourcePreview.title}</span>
            </div>
          }
          onClose={() => setSourcePreview(null)}
          size="lg"
          footer={null}
        >
          <div className="h-[70vh] overflow-auto">
            {sourcePreview.markdown ? (
              <div className="govai-markdown px-4 py-2 text-sm text-gray-700 leading-relaxed">
                <Markdown remarkPlugins={[remarkGfm]}>
                  {sourcePreview.markdown}
                </Markdown>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 flex-col">
                <FileText size={48} className="mb-4 text-gray-300" />
                <p className="text-sm">暂无预览内容</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
