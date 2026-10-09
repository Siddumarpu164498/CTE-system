import { useCallback, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { getRun } from "../api/client";
import { AuditTrail } from "../components/AuditTrail";
import { CriteriaTable } from "../components/CriteriaTable";
import { EvidenceLinks } from "../components/EvidenceLinks";
import { EvidencePanel, type EvidenceTarget } from "../components/EvidencePanel";
import { ReviewNotice } from "../components/ReviewNotice";
import { SilentExclusionCard } from "../components/SilentExclusionCard";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import { OverallStatusBadge, StatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatValue, humanize } from "../lib/format";
import { useAsync } from "../lib/useAsync";

function Panel({ id, title, count, children }: { id: string; title: string; count?: number; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="card p-4 sm:p-6">
      <h2 id={id} className="section-title mb-3">
        {title}
        {count !== undefined ? <span className="text-sm font-normal text-slate-600"> ({count})</span> : null}
      </h2>
      {children}
    </section>
  );
}

export default function Results() {
  const { runId = "" } = useParams<{ runId: string }>();
  const run = useAsync(() => getRun(runId), [runId]);
  const [evidence, setEvidence] = useState<EvidenceTarget | null>(null);
  const openEvidence = useCallback((t: EvidenceTarget) => setEvidence(t), []);
  const closeEvidence = useCallback(() => setEvidence(null), []);

  if (run.loading && !run.data) return <LoadingState label="Loading results…" />;
  if (run.error) return <ErrorState error={run.error} title="Could not load results" onRetry={run.reload} />;
  if (!run.data) return <EmptyState title="No result found." />;

  const d = run.data;
  const r = d.result;

  if (!r) {
    const inProgress = d.status === "queued" || d.status === "running";
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Assessment results</h1>
        <div className="card space-y-3 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={d.status} size="lg" />
            <p className="text-sm text-slate-700">
              {d.trial_title} · {d.patient_label} (v{d.patient_profile_version})
            </p>
          </div>
          {inProgress ? (
            <p className="text-sm">
              This analysis is still in progress. <Link to={`/analysis/${d.run_id}`} className="link">View progress</Link>
            </p>
          ) : (
            <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              <p className="font-semibold">No result is available{d.error?.code ? ` (${String(d.error.code)})` : ""}.</p>
              <p className="mt-1">{d.error?.message ? String(d.error.message) : "The analysis did not produce a result."}</p>
              {d.error?.details && Object.keys(d.error.details).length > 0 ? (
                <p className="mt-1 break-words text-xs">{formatValue(d.error.details)}</p>
              ) : null}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={run.reload}>Refresh</button>
            <Link to="/dashboard" className="btn-secondary">Back to dashboard</Link>
          </div>
        </div>
        <ReviewNotice notice={d.human_review_notice} />
      </div>
    );
  }

  const notice = r.human_review_notice || d.human_review_notice;

  return (
    <div className="space-y-6">
      <ReviewNotice notice={notice} />

      <section aria-labelledby="summary-h" className="card p-4 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 id="summary-h" className="text-2xl font-semibold">Eligibility assessment</h1>
            <p className="break-words text-slate-800">
              <span className="font-semibold">Trial:</span> {d.trial_title}
            </p>
            <p className="break-words text-slate-800">
              <span className="font-semibold">Patient:</span> {d.patient_label}{" "}
              <span className="text-slate-600">(profile version {d.patient_profile_version})</span>
            </p>
            <p className="text-sm text-slate-600">
              Protocol version <span className="font-mono">{r.protocol_version || d.protocol_version}</span> · Analyzed {formatDateTime(r.analyzed_at)}
            </p>
          </div>
          <div className="shrink-0" aria-label="Overall recommendation">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Overall recommendation</p>
            <OverallStatusBadge status={r.overall_status} />
          </div>
        </div>
        <div className="mt-4 rounded-md bg-slate-50 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Explanation</h2>
          <p className="mt-1 whitespace-pre-line text-slate-900">{r.final_explanation}</p>
        </div>
      </section>

      <Panel id="set-h" title="Silent exclusion triggers" count={r.silent_exclusion_triggers.length}>
        {r.silent_exclusion_triggers.length === 0 ? (
          <p className="text-sm text-slate-600">No silent exclusion triggers were detected.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-700">
              Hidden contradictions where a patient appears to meet inclusion criteria but other findings may exclude them.
            </p>
            <div className="space-y-4">
              {r.silent_exclusion_triggers.map((t) => (
                <SilentExclusionCard key={t.trigger_id} trigger={t} onOpenEvidence={openEvidence} />
              ))}
            </div>
          </>
        )}
      </Panel>

      <CriteriaTable title="Inclusion criteria" evaluations={r.inclusion_results} onOpenEvidence={openEvidence} />
      <CriteriaTable title="Exclusion criteria" evaluations={r.exclusion_results} onOpenEvidence={openEvidence} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel id="missing-h" title="Missing information" count={r.missing_information.length}>
          {r.missing_information.length === 0 ? (
            <p className="text-sm text-slate-600">No missing information reported.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {r.missing_information.map((m, i) => (
                <li key={i} className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950">
                  <p className="font-semibold">Missing: {m.attribute}</p>
                  <p>{m.reason}</p>
                  {m.criterion_ids.length > 0 ? <p className="mt-1 font-mono text-xs">Affects {m.criterion_ids.join(", ")}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="conflicts-h" title="Unresolved conflicts" count={r.unresolved_conflicts.length}>
          {r.unresolved_conflicts.length === 0 ? (
            <p className="text-sm text-slate-600">No unresolved conflicts.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {r.unresolved_conflicts.map((c, i) => (
                <li key={i} className="rounded-md border border-slate-300 p-3">
                  <p className="font-semibold">{humanize(c.conflict_type)}</p>
                  <p className="text-slate-800">{c.description}</p>
                  {c.criterion_ids.length > 0 ? <p className="mt-1 font-mono text-xs">Criteria: {c.criterion_ids.join(", ")}</p> : null}
                  {c.attributes.length > 0 ? <p className="text-xs text-slate-600">Attributes: {c.attributes.join(", ")}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel id="notes-h" title="Reviewer notes" count={r.reviewer_notes.length}>
        {r.reviewer_notes.length === 0 ? (
          <p className="text-sm text-slate-600">No reviewer notes.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {r.reviewer_notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel id="decisive-h" title="Decisive evidence trace" count={r.decisive_evidence.length}>
        {r.decisive_evidence.length === 0 ? (
          <p className="text-sm text-slate-600">No decisive evidence recorded.</p>
        ) : (
          <ol className="space-y-3 text-sm">
            {r.decisive_evidence.map((e, i) => (
              <li key={`${e.criterion_id}-${i}`} className="rounded-md border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold">{e.criterion_id}</span>
                  <StatusBadge status={e.status} />
                </div>
                <p className="mt-1">
                  <span className="font-semibold">Expected:</span> <code className="break-words">{e.expected_condition}</code>
                </p>
                <p>
                  <span className="font-semibold">Patient value:</span> {e.patient_value ?? "Not available"}
                </p>
                <div className="mt-2">
                  <EvidenceLinks refs={e.evidence_references} context={e.criterion_id} onOpen={openEvidence} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <AuditTrail runId={d.run_id} />

      <ReviewNotice notice={notice} />

      <div className="flex flex-wrap gap-2">
        <Link to="/dashboard" className="btn-secondary">Back to dashboard</Link>
        <Link to={`/patients/${d.patient_id}/edit`} className="btn-secondary">Update patient data</Link>
      </div>

      {evidence ? <EvidencePanel trialId={d.trial_id} target={evidence} onClose={closeEvidence} /> : null}
    </div>
  );
}
