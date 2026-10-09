import { Link } from "react-router-dom";
import { listPatients, listRuns, listTrials } from "../api/client";
import { AssessmentLauncher } from "../components/AssessmentLauncher";
import { ReviewNotice } from "../components/ReviewNotice";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime } from "../lib/format";
import { useAsync } from "../lib/useAsync";

export default function Dashboard() {
  const data = useAsync(async () => {
    const [trials, patients, runs] = await Promise.all([listTrials(), listPatients(), listRuns(20)]);
    return { trials, patients, runs };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-600">Protocols, patient profiles and eligibility assessments.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/trials/upload" className="btn-secondary">Upload protocol</Link>
          <Link to="/patients/new" className="btn-secondary">New patient</Link>
        </div>
      </div>
      <ReviewNotice compact />

      {data.loading && !data.data ? <LoadingState label="Loading dashboard…" /> : null}
      {data.error ? <ErrorState error={data.error} title="Could not load dashboard" onRetry={data.reload} /> : null}

      {data.data ? (
        <>
          <section aria-labelledby="new-assessment" className="card p-4 sm:p-6">
            <h2 id="new-assessment" className="section-title">New assessment</h2>
            {data.data.trials.length === 0 || data.data.patients.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">
                You need at least one ready trial and one patient.{" "}
                {data.data.trials.length === 0 ? <Link to="/trials/upload" className="link">Upload a protocol</Link> : null}
                {data.data.trials.length === 0 && data.data.patients.length === 0 ? " and " : null}
                {data.data.patients.length === 0 ? <Link to="/patients/new" className="link">create a patient</Link> : null}.
              </p>
            ) : (
              <div className="mt-3 max-w-xl">
                <AssessmentLauncher trials={data.data.trials} patients={data.data.patients} idPrefix="dash" />
              </div>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="trials-h" className="card p-4 sm:p-6">
              <h2 id="trials-h" className="section-title">Trials</h2>
              {data.data.trials.length === 0 ? (
                <div className="mt-3">
                  <EmptyState title="No trial protocols yet">
                    <Link to="/trials/upload" className="link">Upload a protocol PDF</Link> to extract its criteria.
                  </EmptyState>
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-slate-200">
                  {data.data.trials.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                      <div className="min-w-0">
                        <p className="break-words font-medium text-slate-900">{t.title}</p>
                        <p className="text-xs text-slate-600">
                          {t.criteria_count} criteria · Protocol {t.protocol_version ?? "—"}
                          {t.page_count ? ` · ${t.page_count} pages` : ""} · {formatDateTime(t.created_at)}
                        </p>
                      </div>
                      <StatusBadge status={t.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="patients-h" className="card p-4 sm:p-6">
              <h2 id="patients-h" className="section-title">Patients</h2>
              {data.data.patients.length === 0 ? (
                <div className="mt-3">
                  <EmptyState title="No patient profiles yet">
                    <Link to="/patients/new" className="link">Create a patient profile</Link> to run an assessment.
                  </EmptyState>
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-slate-200">
                  {data.data.patients.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div className="min-w-0">
                        <p className="break-words font-medium text-slate-900">{p.label}</p>
                        <p className="text-xs text-slate-600">Version {p.version} · Updated {formatDateTime(p.updated_at)}</p>
                      </div>
                      <Link to={`/patients/${p.id}/edit`} className="link text-sm" aria-label={`Edit patient ${p.label}`}>
                        Edit
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section aria-labelledby="runs-h" className="card p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 id="runs-h" className="section-title">Recent assessments</h2>
              <button type="button" className="btn-ghost py-1 text-sm" onClick={data.reload} disabled={data.loading}>
                {data.loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            {data.data.runs.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="No assessments yet">Use “New assessment” above to analyze a patient against a trial.</EmptyState>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-slate-200">
                {data.data.runs.map((r) => {
                  const done = r.status === "completed" || r.status === "failed";
                  return (
                    <li key={r.run_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="break-words font-medium text-slate-900">{r.trial_title}</p>
                        <p className="text-xs text-slate-600">
                          {r.patient_label} (v{r.patient_profile_version}) · {formatDateTime(r.created_at)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        {r.overall_status ? <StatusBadge status={r.overall_status} /> : <StatusBadge status={r.status} />}
                        <Link
                          to={done ? `/results/${r.run_id}` : `/analysis/${r.run_id}`}
                          className="link text-sm"
                          aria-label={`${done ? "View results" : "View progress"} for ${r.patient_label} in ${r.trial_title}`}
                        >
                          {done ? "View results" : "View progress"}
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
