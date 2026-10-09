import type { DataQualityFlag } from "../types";
import { humanize } from "../lib/format";
import { AlertTriangleIcon, CheckCircleIcon } from "./Icons";

export function DataQualityFlags({ flags }: { flags: DataQualityFlag[] }) {
  if (flags.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-900">
        <CheckCircleIcon /> No data quality issues detected.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {flags.map((f, i) => (
        <li key={`${f.attribute}-${i}`} className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">
          <AlertTriangleIcon className="mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">{humanize(f.flag)}</span> — {f.attribute}: {f.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}
