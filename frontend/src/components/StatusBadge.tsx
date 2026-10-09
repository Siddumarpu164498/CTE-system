import type { ReactNode } from "react";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  MinusCircleIcon,
  QuestionIcon,
  SpinnerIcon,
  XOctagonIcon,
} from "./Icons";

type Tone = "positive" | "negative" | "warning" | "neutral" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  positive: "border-emerald-300 bg-emerald-50 text-emerald-900",
  negative: "border-red-300 bg-red-50 text-red-900",
  warning: "border-amber-300 bg-amber-50 text-amber-950",
  neutral: "border-slate-300 bg-slate-100 text-slate-800",
  info: "border-accent-200 bg-accent-50 text-accent-800",
};

interface BadgeSpec {
  label: string;
  tone: Tone;
  icon: ReactNode;
}

const SPECS: Record<string, BadgeSpec> = {
  // overall
  ELIGIBLE: { label: "Eligible", tone: "positive", icon: <CheckCircleIcon /> },
  NOT_ELIGIBLE: { label: "Not eligible", tone: "negative", icon: <XOctagonIcon /> },
  MORE_INFORMATION_REQUIRED: { label: "More information required", tone: "warning", icon: <QuestionIcon /> },
  // inclusion
  SATISFIED: { label: "Satisfied", tone: "positive", icon: <CheckCircleIcon /> },
  UNSATISFIED: { label: "Unsatisfied", tone: "negative", icon: <XOctagonIcon /> },
  // exclusion
  TRIGGERED: { label: "Triggered", tone: "negative", icon: <XOctagonIcon /> },
  NOT_TRIGGERED: { label: "Not triggered", tone: "positive", icon: <CheckCircleIcon /> },
  UNKNOWN: { label: "Unknown", tone: "warning", icon: <QuestionIcon /> },
  // runs / nodes / trials
  pending: { label: "Pending", tone: "neutral", icon: <ClockIcon /> },
  queued: { label: "Queued", tone: "neutral", icon: <ClockIcon /> },
  running: { label: "Running", tone: "info", icon: <SpinnerIcon /> },
  processing: { label: "Processing", tone: "info", icon: <SpinnerIcon /> },
  completed: { label: "Completed", tone: "positive", icon: <CheckCircleIcon /> },
  ready: { label: "Ready", tone: "positive", icon: <CheckCircleIcon /> },
  failed: { label: "Failed", tone: "negative", icon: <AlertTriangleIcon /> },
  error: { label: "Error", tone: "negative", icon: <AlertTriangleIcon /> },
  skipped: { label: "Skipped", tone: "neutral", icon: <MinusCircleIcon /> },
};

export function statusLabel(status: string): string {
  return SPECS[status]?.label ?? status.replace(/_/g, " ");
}

export function StatusBadge({
  status,
  size = "sm",
  uppercase = false,
}: {
  status: string | null | undefined;
  size?: "sm" | "lg";
  uppercase?: boolean;
}) {
  const key = status ?? "UNKNOWN";
  const spec: BadgeSpec = SPECS[key] ?? { label: key.replace(/_/g, " "), tone: "neutral", icon: <MinusCircleIcon /> };
  const sizeCls = size === "lg" ? "gap-2 px-4 py-2 text-base font-bold" : "gap-1.5 px-2 py-0.5 text-xs font-semibold";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border ${sizeCls} ${TONE_CLASSES[spec.tone]}`}>
      <span className="shrink-0">{spec.icon}</span>
      <span className={uppercase ? "uppercase tracking-wide" : undefined}>{spec.label}</span>
    </span>
  );
}

/** Large overall-eligibility badge with uppercase text label (never color alone). */
export function OverallStatusBadge({ status }: { status: string | null | undefined }) {
  return <StatusBadge status={status} size="lg" uppercase />;
}
