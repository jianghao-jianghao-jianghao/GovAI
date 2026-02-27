import React, { useState, useCallback, useRef } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle, X } from "lucide-react";

export const Toast = ({ msgs, remove }) => (
  <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
    {msgs.map((m) => (
      <div
        key={m.id}
        className={`flex items-center p-4 rounded shadow-lg text-white min-w-[300px] animate-in slide-in-from-right duration-300 ${m.type === "error" ? "bg-red-500" : m.type === "success" ? "bg-green-600" : "bg-blue-500"}`}
      >
        {m.type === "error" ? (
          <AlertOctagon size={20} className="mr-2" />
        ) : (
          <CheckCircle size={20} className="mr-2" />
        )}
        <div className="flex-1 text-sm font-medium">{m.text}</div>
        <X
          size={16}
          className="cursor-pointer ml-4 opacity-70 hover:opacity-100"
          onClick={() => remove(m.id)}
        />
      </div>
    ))}
  </div>
);

export const EmptyState = ({ icon: Icon, title, desc, action }) => (
  <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-500 pointer-events-none">
    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
      <Icon size={32} className="text-gray-400" />
    </div>
    <h3 className="text-lg font-bold text-gray-800 mb-2">{title}</h3>
    <p className="text-sm max-w-xs mb-6">{desc}</p>
    <div className="pointer-events-auto">{action}</div>
  </div>
);

export const Modal = ({
  title,
  children,
  onClose,
  footer,
  size = "md",
}: {
  title: any;
  children?: React.ReactNode;
  onClose: any;
  footer: any;
  size?: string;
}) => {
  const widthClass =
    size === "lg"
      ? "max-w-4xl"
      : size === "xl"
        ? "max-w-6xl"
        : size === "sm"
          ? "max-w-sm"
          : "max-w-md";
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div
        className={`bg-white rounded-lg shadow-xl w-full ${widthClass} flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200`}
      >
        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
          <h3 className="font-bold text-gray-800">{title}</h3>
          <button onClick={onClose}>
            <X size={20} className="text-gray-400 hover:text-gray-600" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="p-4 border-t bg-gray-50 rounded-b-lg flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/* ── 通用确认弹窗 hook ── */
interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
}

interface ConfirmState extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback(
    (opts: string | ConfirmOptions): Promise<boolean> => {
      const options: ConfirmOptions =
        typeof opts === "string" ? { message: opts } : opts;
      return new Promise<boolean>((resolve) => {
        setState({ ...options, resolve });
      });
    },
    [],
  );

  const handleClose = useCallback(
    (ok: boolean) => {
      state?.resolve(ok);
      setState(null);
    },
    [state],
  );

  const ConfirmDialog = state ? (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={() => handleClose(false)}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 pb-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                state.variant === "danger"
                  ? "bg-red-50"
                  : state.variant === "warning"
                    ? "bg-amber-50"
                    : "bg-blue-50"
              }`}
            >
              <AlertTriangle
                size={20}
                className={
                  state.variant === "danger"
                    ? "text-red-500"
                    : state.variant === "warning"
                      ? "text-amber-500"
                      : "text-blue-500"
                }
              />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-gray-900 mb-1">
                {state.title || "操作确认"}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {state.message}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2 p-4 pt-2 justify-end">
          <button
            onClick={() => handleClose(false)}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition font-medium"
          >
            {state.cancelText || "取消"}
          </button>
          <button
            onClick={() => handleClose(true)}
            className={`px-4 py-2 text-sm text-white rounded-lg transition font-medium ${
              state.variant === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : state.variant === "warning"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {state.confirmText || "确认"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, ConfirmDialog };
}
