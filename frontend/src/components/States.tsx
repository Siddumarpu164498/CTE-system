import type { ReactNode } from "react";
import { errorMessage } from "../api/client";
import { AlertTriangleIcon, SpinnerIcon } from "./Icons";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 py-12 text-slate-600">
      <SpinnerIcon className="text-xl text-accent-600" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({
  error,
  title = "Something went wrong",
  onRetry,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
      <div className="flex items-start gap-3">
        <AlertTriangleIcon className="mt-0.5 shrink-0 text-lg" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          <p className="mt-1 break-words text-sm">{typeof error === "string" ? error : errorMessage(error)}</p>
          {onRetry ? (
            <button type="button" onClick={onRetry} className="btn-secondary mt-3">
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-surface p-6 text-center">
      <p className="font-medium text-slate-800">{title}</p>
      {children ? <div className="mt-2 text-sm text-slate-600">{children}</div> : null}
    </div>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-2 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
      <AlertTriangleIcon className="mt-0.5 shrink-0" />
      <span className="break-words">{message}</span>
    </p>
  );
}
