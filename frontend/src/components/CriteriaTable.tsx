import type { CriterionEvaluation } from "../types";
import { EvidenceLinks } from "./EvidenceLinks";
import type { EvidenceTarget } from "./EvidencePanel";
import { StatusBadge } from "./StatusBadge";
import { humanize } from "../lib/format";

// Left-edge color cue per status (the badge text remains the primary signal).
const STRIPE: Record<string, string> = {
  SATISFIED: "border-l-emerald-500",
  NOT_TRIGGERED: "border-l-emerald-500",
  UNSATISFIED: "border-l-red-500",
  TRIGGERED: "border-l-red-500",
  UNKNOWN: "border-l-amber-500",
};

function Reason({ e }: { e: CriterionEvaluation }) {
  return (
    <div className="space-y-1">
      <p>{e.explanation}</p>
      {e.uncertainty_notes.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-5 text-amber-900">
          {e.uncertainty_notes.map((n, i) => (
            <li key={i}>
              <span className="font-semibold">Uncertainty:</span> {n}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-slate-600">Method: {humanize(e.comparison_method)}</p>
      {e.requires_human_review ? (
        <p className="text-xs font-semibold text-amber-900">Flagged for human review</p>
      ) : null}
    </div>
  );
}

function Rule({ e }: { e: CriterionEvaluation }) {
  return (
    <div className="space-y-1">
      <p className="text-slate-900">{e.original_text}</p>
      <p className="text-xs text-slate-600">
        <span className="font-semibold">Expected:</span> <code className="break-words">{e.expected_condition}</code>
      </p>
    </div>
  );
}

export function CriteriaTable({
  title,
  evaluations,
  onOpenEvidence,
}: {
  title: string;
  evaluations: CriterionEvaluation[];
  onOpenEvidence: (t: EvidenceTarget) => void;
}) {
  const slug = title.replace(/\W+/g, "-").toLowerCase();
  const headingId = `tbl-${slug}`;
  return (
    <section id={slug} aria-labelledby={headingId} className="card scroll-mt-32 overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 id={headingId} className="section-title">
          {title} <span className="text-sm font-normal text-slate-600">({evaluations.length})</span>
        </h2>
      </div>
      {evaluations.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-600">No {title.toLowerCase()} were evaluated.</p>
      ) : (
        <>
          {/* Desktop / tablet: table */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">{title}</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="w-24 px-4 py-2">ID</th>
                  <th scope="col" className="w-36 px-4 py-2">Status</th>
                  <th scope="col" className="px-4 py-2">Rule</th>
                  <th scope="col" className="w-40 px-4 py-2">Patient value</th>
                  <th scope="col" className="px-4 py-2">Reason</th>
                  <th scope="col" className="w-28 px-4 py-2">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 align-top">
                {evaluations.map((e) => (
                  <tr key={e.criterion_id} className={`border-l-4 transition-colors hover:bg-slate-50 ${STRIPE[e.status] ?? "border-l-transparent"}`}>
                    <th scope="row" className="px-4 py-3 font-mono text-xs font-semibold text-slate-800">{e.criterion_id}</th>
                    <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                    <td className="break-words px-4 py-3"><Rule e={e} /></td>
                    <td className="break-words px-4 py-3">{e.patient_value ?? <span className="text-slate-500">Not available</span>}</td>
                    <td className="break-words px-4 py-3 text-slate-800"><Reason e={e} /></td>
                    <td className="px-4 py-3">
                      <EvidenceLinks refs={e.evidence_references} context={e.criterion_id} onOpen={onOpenEvidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile: stacked cards */}
          <ul className="divide-y divide-slate-200 lg:hidden">
            {evaluations.map((e) => (
              <li key={e.criterion_id} className={`space-y-3 border-l-4 px-4 py-4 text-sm ${STRIPE[e.status] ?? "border-l-transparent"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-800">{e.criterion_id}</span>
                  <StatusBadge status={e.status} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-600">Rule</p>
                  <Rule e={e} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-600">Patient value</p>
                  <p className="break-words">{e.patient_value ?? <span className="text-slate-500">Not available</span>}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-600">Reason</p>
                  <Reason e={e} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-slate-600">Evidence</p>
                  <EvidenceLinks refs={e.evidence_references} context={e.criterion_id} onOpen={onOpenEvidence} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
