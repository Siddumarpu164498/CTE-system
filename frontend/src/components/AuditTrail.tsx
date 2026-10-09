import { useState } from "react";
import { getAudit } from "../api/client";
import type { RunAudit } from "../types";
import { formatDateTime, formatValue, humanize } from "../lib/format";
import { ChevronIcon } from "./Icons";
import { ErrorState, LoadingState } from "./States";
import { StatusBadge } from "./StatusBadge";

function KeyValues({ data }: { data: Record<string, unknown> | null }) {
  if (!data || Object.keys(data).length === 0) return <span className="text-slate-500">—</span>;
  return (
    <dl className="space-y-0.5">
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="flex min-w-0 gap-1">
          <dt className="shrink-0 font-semibold">{k}:</dt>
          <dd className="min-w-0 break-words">{formatValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AuditTrail({ runId }: { runId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<RunAudit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getAudit(runId));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading) void load();
  };

  return (
    <section className="card" aria-labelledby="audit-h">
      <h2 id="audit-h">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="audit-panel"
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-lg font-semibold text-slate-900 hover:bg-slate-50"
        >
          <ChevronIcon className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
          Audit trail &amp; agent logs
        </button>
      </h2>
      {open ? (
        <div id="audit-panel" className="space-y-6 border-t border-slate-200 px-4 py-4" aria-live="polite">
          {loading ? <LoadingState label="Loading audit trail…" /> : null}
          {error ? <ErrorState error={error} title="Could not load audit trail" onRetry={() => void load()} /> : null}
          {data ? (
            <>
              <div>
                <h3 className="mb-2 font-semibold">Agent execution logs ({data.agent_execution_logs.length})</h3>
                {data.agent_execution_logs.length === 0 ? (
                  <p className="text-sm text-slate-600">No agent logs recorded.</p>
                ) : (
                  <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 text-sm">
                    {data.agent_execution_logs.map((l, i) => (
                      <li key={`${l.node}-${i}`} className="grid gap-2 p-3 md:grid-cols-[12rem_8rem_1fr]">
                        <div>
                          <p className="font-medium">{humanize(l.node)}</p>
                          <p className="text-xs text-slate-600">{formatDateTime(l.started_at)}</p>
                        </div>
                        <div><StatusBadge status={l.status} /></div>
                        <div className="min-w-0 text-xs text-slate-700"><KeyValues data={l.summary} /></div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Audit events ({data.audit_events.length})</h3>
                {data.audit_events.length === 0 ? (
                  <p className="text-sm text-slate-600">No audit events recorded.</p>
                ) : (
                  <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 text-sm">
                    {data.audit_events.map((e) => (
                      <li key={e.id} className="grid gap-2 p-3 md:grid-cols-[12rem_1fr]">
                        <div>
                          <p className="font-mono text-xs font-semibold">{e.action}</p>
                          <p className="text-xs text-slate-600">{formatDateTime(e.created_at)}</p>
                        </div>
                        <div className="min-w-0 text-xs text-slate-700">
                          <p className="break-all">
                            {e.resource_type} · {e.resource_id}
                          </p>
                          <KeyValues data={e.details} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
