/**
 * 聊天会话与消息 API（含 SSE 流式响应）
 */
import { api, getToken, clearToken, API_BASE } from "./client";

// ── 类型 ──

export interface ChatSession {
  id: string;
  title: string;
  qa_ref_enabled: boolean;
  kb_collection_ids: string[];
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  citations?: any[];
  reasoning?: string;
  knowledge_graph_data?: any[];
  created_at: string;
}

export interface SessionDetail extends ChatSession {
  messages: ChatMessage[];
}

// ── 会话 CRUD ──

export async function apiListSessions(page = 1, pageSize = 50) {
  const res = await api.get<{ items: ChatSession[]; total: number }>(
    "/chat/sessions",
    { page: String(page), page_size: String(pageSize) },
  );
  return res.data;
}

export async function apiCreateSession(body: {
  title?: string;
  kb_collection_ids?: string[];
  qa_ref_enabled?: boolean;
}) {
  const res = await api.post<{ id: string }>("/chat/sessions", body);
  return res.data;
}

export async function apiGetSession(sessionId: string) {
  const res = await api.get<SessionDetail>(`/chat/sessions/${sessionId}`);
  return res.data;
}

export async function apiUpdateSession(
  sessionId: string,
  body: {
    title?: string;
    kb_collection_ids?: string[];
    qa_ref_enabled?: boolean;
  },
) {
  await api.put(`/chat/sessions/${sessionId}`, body);
}

export async function apiDeleteSession(sessionId: string) {
  await api.delete(`/chat/sessions/${sessionId}`);
}

// ── SSE 流式消息 ──

export interface ReasoningStep {
  step: number;
  title: string;
  status: "running" | "completed";
  detail: string;
  elapsed?: number;
  hit?: boolean;
  records_count?: number;
  entities_count?: number;
  triples_count?: number;
}

export interface SSECallbacks {
  onStart?: (data: { message_id: string; conversation_id: string }) => void;
  onTextChunk?: (text: string) => void;
  onCitations?: (citations: any[]) => void;
  onReasoning?: (text: string, steps?: ReasoningStep[]) => void;
  onReasoningStep?: (step: ReasoningStep) => void;
  onKnowledgeGraph?: (data: any) => void;
  onEnd?: (data: {
    message_id: string;
    conversation_id: string;
    token_count: number;
  }) => void;
  onWarning?: (keywords: string[]) => void;
  onError?: (message: string) => void;
  onQaMatch?: (message: ChatMessage) => void;
}

export async function apiSendMessage(
  sessionId: string,
  content: string,
  quoteText?: string,
  callbacks?: SSECallbacks,
  abortSignal?: AbortSignal,
) {
  const token = getToken();
  const resp = await fetch(`${API_BASE}/chat/sessions/${sessionId}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ content, quote_text: quoteText }),
    signal: abortSignal,
  });

  if (resp.status === 401) {
    clearToken();
    callbacks?.onError?.("登录已过期，请重新登录");
    return;
  }

  const contentType = resp.headers.get("content-type") || "";

  // QA 匹配命中 → 普通 JSON
  if (contentType.includes("application/json")) {
    const json = await resp.json();
    if (json.code !== 0) {
      callbacks?.onError?.(json.message || "发送失败");
      return;
    }
    if (json.data?.type === "qa_match") {
      callbacks?.onQaMatch?.(json.data.message);
    }
    return;
  }

  // SSE 流式
  if (!resp.body) {
    callbacks?.onError?.("浏览器不支持流式响应");
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const dataStr = line.slice(6).trim();
          try {
            const data = JSON.parse(dataStr);
            switch (currentEvent) {
              case "message_start":
                callbacks?.onStart?.(data);
                break;
              case "text_chunk":
                callbacks?.onTextChunk?.(data.text || "");
                break;
              case "citations":
                callbacks?.onCitations?.(data.citations || []);
                break;
              case "reasoning":
                callbacks?.onReasoning?.(data.text || "", data.steps);
                break;
              case "reasoning_step":
                callbacks?.onReasoningStep?.(data as ReasoningStep);
                break;
              case "knowledge_graph":
                callbacks?.onKnowledgeGraph?.(data);
                break;
              case "message_end":
                callbacks?.onEnd?.(data);
                break;
              case "warning":
                callbacks?.onWarning?.(data.keywords || []);
                break;
              case "error":
                callbacks?.onError?.(data.message || "未知错误");
                break;
            }
          } catch {
            /* skip parse error */
          }
          currentEvent = "";
        }
      }
    }
  } catch (err: any) {
    if (err.name !== "AbortError") {
      callbacks?.onError?.(err.message || "连接中断");
    }
  }
}
