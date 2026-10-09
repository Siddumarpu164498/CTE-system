import { ShieldIcon } from "./Icons";

export const DEFAULT_REVIEW_NOTICE =
  "Clinical decision support only. This assessment supports, but does not replace, review by a qualified clinician or trial investigator. Final eligibility must be confirmed by the study team.";

export function ReviewNotice({ notice, compact = false }: { notice?: string | null; compact?: boolean }) {
  const text = notice && notice.trim() ? notice : DEFAULT_REVIEW_NOTICE;
  return (
    <aside
      aria-label="Human review notice"
      className={`flex items-start gap-3 rounded-lg border-2 border-amber-400 bg-amber-50 text-amber-950 ${compact ? "p-3" : "p-4"}`}
    >
      <ShieldIcon className="mt-0.5 shrink-0 text-xl text-amber-700" />
      <div>
        <p className="text-sm font-bold uppercase tracking-wide">Human review required</p>
        <p className="mt-1 text-sm">{text}</p>
      </div>
    </aside>
  );
}
