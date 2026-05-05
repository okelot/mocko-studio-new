"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

const ToastContext = createContext({
  toast: (_message: string, _type?: Toast["type"]) => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4000);
  }, []);

  const colors = {
    success: "border-emerald-500/40 bg-emerald-900/80 text-emerald-300",
    error: "border-red-500/40 bg-red-900/80 text-red-300",
    info: "border-blue-500/40 bg-blue-900/80 text-blue-300",
  };

  const icons = { success: "✓", error: "×", info: "i" };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[60] flex max-w-[calc(100vw-3rem)] flex-col gap-2">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`animate-slide-in flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-xl backdrop-blur-md ${colors[item.type]}`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs">
              {icons[item.type]}
            </span>
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
