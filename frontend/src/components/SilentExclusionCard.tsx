import type { SilentExclusionTrigger } from "../types";
import { formatDate, formatPercent, humanize } from "../lib/format";
import { EvidenceLinks } from "./EvidenceLinks";
import type { EvidenceTarget } from "./EvidencePanel";
import { AlertTriangleIcon } from "./Icons";

const PRIORITY: Record<string, string> = {
  high: "border-red-300 bg-red-50 text-red-900",
  medium: "border-amber-300 bg-amber-50 text-amber-950",
  low: "border-slate-300 bg-slate-100 text-slate-800",
};

function IdList({ label, ids }: { label: string; ids: string[] }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-slate-600">{label}</dt>
      <dd className="font-mono text-xs">{ids.length > 0 ? ids.join(", ") : "—"}</dd>
    </div>
  );
}

export function SilentExclusionCard({ trigger, onOpenEvidence }: { trigger: SilentExclusionTrigger; onOpenEvidence: (t: EvidenceTarget) => void }) {
  return (
    <article className="rounded-lg border-2 border-amber-400 bg-surface p-4" aria-labelledby={`set-${trigger.trigger_id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangleIcon className="text-lg text-amber-700" />
        <h3 id={`set-${trigger.trigger_id}`} className="font-semibold text-slate-900">
          {humanize(trigger.domain)} <span className="font-mono text-xs font-normal text-slate-600">{trigger.trigger_id}</span>
        </h3>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${PRIORITY[trigger.review_priority] ?? PRIORITY.low}`}>
          Priority: {trigger.review_priority.toUpperCase()}
        </span>
        <span className="rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950">
          Requires human review
        </span>
        <span className="text-xs text-slate-600">Confidence {formatPercent(trigger.confidence)}</span>
      </div>
      <p className="mt-2 text-sm text-slate-800">{trigger.explanation}</p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <IdList label="Inclusion criteria" ids={trigger.inclusion_criterion_ids} />
        <IdList label="Exclusion criteria" ids={trigger.exclusion_criterion_ids} />
        <IdList label="Related failing criteria" ids={trigger.related_failing_criterion_ids} />
      </dl>
      <div className="mt-3">
        <p className="text-xs font-semibold uppercase text-slate-600">Patient findings</p>
        <ul className="mt-1 list-disc pl-5 text-sm">
          {trigger.patient_findings.map((f, i) => (
            <li key={i}>
              <span className="font-medium">{f.attribute}</span>: {f.value}
              {f.observed_at ? <span className="text-slate-600"> (observed {formatDate(f.observed_at)})</span> : null}
            </li>
          ))}
        </ul>
      </div>
      {trigger.unresolved_uncertainties.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase text-slate-600">Unresolved uncertainties</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-amber-950">
            {trigger.unresolved_uncertainties.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-3">
        <p className="mb-1 text-xs font-semibold uppercase text-slate-600">Evidence</p>
        <EvidenceLinks refs={trigger.evidence_references} context={trigger.trigger_id} onOpen={onOpenEvidence} />
      </div>
    </article>
  );
}
