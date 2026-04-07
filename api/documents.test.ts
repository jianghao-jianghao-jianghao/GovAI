import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  uploadRequest: vi.fn(),
  downloadRequest: vi.fn(),
  getToken: vi.fn(() => "test-token"),
}));

import {
  AI_LOCK_CONFLICT_ERROR_PREFIX,
  AI_PROCESS_IDLE_TIMEOUT_MS,
  apiAiProcess,
  buildAiLockConflictError,
  isAiLockConflictError,
  stripAiLockConflictErrorPrefix,
  type AiProcessChunk,
} from "./documents";

function makeSseResponse(lines: string[]) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(lines.join("\n") + "\n"));
        controller.close();
      },
    }),
  } as Response;
}

function makeTimeoutResponse() {
  let resolveRead: ((value: ReadableStreamReadResult<Uint8Array>) => void) | null = null;
  const reader = {
    read: vi.fn(
      () =>
        new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => {
          resolveRead = resolve;
        }),
    ),
    cancel: vi.fn(async () => {
      resolveRead?.({ done: true, value: undefined });
    }),
  };

  return {
    reader,
    response: {
      ok: true,
      status: 200,
      body: {
        getReader: () => reader,
      },
    } as Response,
  };
}

describe("apiAiProcess SSE contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("parses text / structured_paragraph / outline / done chunks and emits onDone once", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeSseResponse([
        'data: {"type":"text","text":"起草中"}',
        'data: {"type":"structured_paragraph","paragraph":{"text":"标题","style_type":"title"}}',
        'data: {"type":"outline","outline_text":"一、申请事项"}',
        'data: {"type":"done","full_content":"完整正文","new_title":"关于申请专项经费的请示"}',
        "data: [DONE]",
      ]),
    );

    const chunks: AiProcessChunk[] = [];
    const errors: string[] = [];
    const onDone = vi.fn();

    await apiAiProcess(
      "doc-1",
      "draft",
      "请起草",
      (chunk) => chunks.push(chunk),
      onDone,
      (err) => errors.push(err),
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      "text",
      "structured_paragraph",
      "outline",
      "done",
    ]);
    expect(chunks[1].paragraph?.style_type).toBe("title");
    expect(chunks[2].outline_text).toBe("一、申请事项");
    expect(chunks[3].new_title).toBe("关于申请专项经费的请示");
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([]);
  });

  it("maps HTTP 409 lock conflict to frontend special error prefix", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ code: 1003, message: "busy" }),
    } as Response);

    const errors: string[] = [];

    await apiAiProcess(
      "doc-1",
      "draft",
      "请起草",
      () => undefined,
      () => undefined,
      (err) => errors.push(err),
    );

    expect(errors).toEqual([`${AI_LOCK_CONFLICT_ERROR_PREFIX}busy`]);
  });

  it("times out idle SSE streams and reports timeout once", async () => {
    vi.useFakeTimers();
    const { response, reader } = makeTimeoutResponse();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    const errors: string[] = [];
    const promise = apiAiProcess(
      "doc-1",
      "draft",
      "请起草",
      () => undefined,
      () => undefined,
      (err) => errors.push(err),
    );

    await vi.advanceTimersByTimeAsync(AI_PROCESS_IDLE_TIMEOUT_MS);
    await promise;

    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(errors).toEqual(["AI 处理超时：服务端长时间无响应，请重试"]);
  });

  it("exposes lock conflict helpers for UI handlers", () => {
    const prefixed = buildAiLockConflictError("busy");

    expect(prefixed).toBe(`${AI_LOCK_CONFLICT_ERROR_PREFIX}busy`);
    expect(isAiLockConflictError(prefixed)).toBe(true);
    expect(stripAiLockConflictErrorPrefix(prefixed)).toBe("busy");
    expect(stripAiLockConflictErrorPrefix("普通错误")).toBe("普通错误");
  });
});
