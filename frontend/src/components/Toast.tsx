import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangleIcon, CheckCircleIcon, CloseIcon, SparklesIcon } from "./Icons";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
}

interface ToastApi {
  notify: (tone: ToastTone, title: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE: Record<ToastTone, { cls: string; Icon: typeof CheckCircleIcon }> = {
  success: { cls: "text-emerald-700", Icon: CheckCircleIcon },
  error: { cls: "text-red-700", Icon: AlertTriangleIcon },
  info: { cls: "text-accent-700", Icon: SparklesIcon },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const notify = useCallback(
    (tone: ToastTone, title: string, message?: string) => {
      const id = nextId.current++;
      setItems((xs) => [...xs.slice(-3), { id, tone, title, message }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end">
        {items.map((t) => {
          const { cls, Icon } = TONE[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className="pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-xl border border-slate-200 bg-surface p-3.5 shadow-lift"
            >
              <Icon className={`mt-0.5 shrink-0 text-lg ${cls}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{t.title}</p>
                {t.message ? <p className="mt-0.5 break-words text-sm text-slate-600">{t.message}</p> : null}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                <CloseIcon />
                <span className="sr-only">Dismiss notification</span>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
