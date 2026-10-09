import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getRunStatus } from "../api/client";
import { AgentProgress } from "../components/AgentProgress";
import { ReviewNotice } from "../components/ReviewNotice";
import { ErrorState, LoadingState } from "../components/States";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatValue } from "../lib/format";
import type { RunStatus } from "../types";

const POLL_MS = 1000;
const MAX_CONSECUTIVE_FAILURES = 5;
const AUTO_NAVIGATE_MS = 1500;

export default function Analysis() {
  const { runId = "" } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [pollError, setPollError] = useState<unknown>(null);
  const [pollNonce, setPollNonce] = useState(0);
  const failures = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    failures.current = 0;
    setPollError(null);

    const tick = async () => {
      try {
        const s = await getRunStatus(runId);
        if (cancelled) return;
        failures.current = 0;
        setStatus(s);
        if (s.status === "completed" || s.status === "failed") return;
      } catch (err) {
        if (cancelled) return;
        failures.current += 1;
        if (failures.current >= MAX_CONSECUTIVE_FAILURES) {
          setPollError(err);
          return;
        }
      }
      timer = window.setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [runId, pollNonce]);

  const retry = useCallback(() => setPollNonce((n) => n + 1), []);

  const completed = status?.status === "completed";
  const failed = status?.status === "failed";

  useEffect(() => {
    if (!completed) return;
    const t = window.setTimeout(() => navigate(`/results/${runId}`), AUTO_NAVIGATE_MS);
    return () => window.clearTimeout(t);
  }, [completed, navigate, runId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Eligibility analysis</h1>
          <p className="break-all text-xs text-slate-600">Run {runId}</p>
          {status ? <p className="text-sm text-slate-600">Started {formatDateTime(status.created_at)}</p> : null}
        </div>
        {status ? <StatusBadge status={status.status} size="lg" /> : null}
      </div>

      {!status && !pollError ? <LoadingState label="Loading analysis status…" /> : null}
      {pollError ? <ErrorState error={pollError} title="Lost contact with the analysis service" onRetry={retry} /> : null}

      {status ? (
        <>
          <div aria-live="polite" className="sr-only">
            {completed ? "Analysis completed. Opening results." : failed ? "Analysis failed." : `Analysis ${status.status}.`}
          </div>

          {completed ? (
            <div role="status" className="flex flex-col gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-emerald-950">
                <p className="font-semibold">Analysis complete.</p>
                {status.overall_status ? <StatusBadge status={status.overall_status} /> : null}
                <p className="text-sm">Opening results…</p>
              </div>
              <Link to={`/results/${runId}`} className="btn-primary">View results</Link>
            </div>
          ) : null}

          {failed ? (
            <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
              <p className="font-semibold">Analysis failed{status.error?.code ? ` (${String(status.error.code)})` : ""}</p>
              <p className="mt-1 text-sm">{status.error?.message ? String(status.error.message) : "The workflow stopped before producing a result."}</p>
              {status.error?.details && Object.keys(status.error.details).length > 0 ? (
                <dl className="mt-2 text-xs">
                  {Object.entries(status.error.details).map(([k, v]) => (
                    <div key={k} className="flex gap-1">
                      <dt className="font-semibold">{k}:</dt>
                      <dd className="break-words">{formatValue(v)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={`/results/${runId}`} className="btn-secondary">View run details</Link>
                <Link to="/dashboard" className="btn-secondary">Back to dashboard</Link>
              </div>
            </div>
          ) : null}

          <section aria-labelledby="progress-h" className="card p-4 sm:p-6" aria-busy={!completed && !failed}>
            <h2 id="progress-h" className="section-title mb-1">Agent workflow</h2>
            <p className="mb-4 text-sm text-slate-600">
              Each step is a specialised agent. Inclusion matching and exclusion detection run in parallel.
            </p>
            <AgentProgress progress={status.progress} />
          </section>
        </>
      ) : null}

      <ReviewNotice compact />
    </div>
  );
}
