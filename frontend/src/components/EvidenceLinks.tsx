import type { EvidenceReference } from "../types";
import type { EvidenceTarget } from "./EvidencePanel";

/** Renders "p. N" buttons for each evidence reference; clicking opens the evidence panel. */
export function EvidenceLinks({
  refs,
  context,
  onOpen,
}: {
  refs: EvidenceReference[];
  context?: string;
  onOpen: (t: EvidenceTarget) => void;
}) {
  if (refs.length === 0) return <span className="text-sm text-slate-500">No citation</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {refs.map((r, i) => (
        <li key={`${r.page}-${i}`}>
          <button
            type="button"
            onClick={() => onOpen({ page: r.page, excerpt: r.excerpt, context })}
            className="rounded border border-accent-200 bg-accent-50 px-2 py-0.5 text-xs font-semibold text-accent-800 hover:bg-accent-100"
            title={r.excerpt}
            aria-label={`Open protocol page ${r.page}${context ? ` evidence for ${context}` : ""}${r.source === "retrieval" ? " (retrieved passage)" : ""}`}
          >
            p. {r.page}
            {r.source === "retrieval" ? <span className="ml-1 font-normal">(retrieved)</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
