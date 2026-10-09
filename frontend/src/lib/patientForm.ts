import type {
  DiagnosisInput,
  HistoryInput,
  LabInput,
  MedicationInput,
  PatientProfileInput,
  Sex,
} from "../types";

// Form state keeps every field as a string so inputs stay controlled; it is converted to
// the strict backend schema (extra="forbid", typed numbers/dates, nulls omitted) on submit.

let rowCounter = 0;
export function rowKey(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

export interface LabRow {
  key: string;
  name: string;
  value: string;
  unit: string;
  observed_at: string;
  reference_range: string;
}
export interface DiagnosisRow {
  key: string;
  name: string;
  code: string;
  documented_at: string;
}
export interface MedicationRow {
  key: string;
  name: string;
  start_date: string;
  stop_date: string;
}
export type PresentChoice = "yes" | "no" | "unknown";
export interface HistoryRow {
  key: string;
  condition: string;
  present: PresentChoice;
}

export interface PatientFormState {
  label: string;
  age: string;
  sex: "" | Sex;
  date_of_birth: string;
  as_of: string;
  labs: LabRow[];
  diagnoses: DiagnosisRow[];
  medications: MedicationRow[];
  history: HistoryRow[];
}

export const emptyLab = (): LabRow => ({ key: rowKey(), name: "", value: "", unit: "", observed_at: "", reference_range: "" });
export const emptyDiagnosis = (): DiagnosisRow => ({ key: rowKey(), name: "", code: "", documented_at: "" });
export const emptyMedication = (): MedicationRow => ({ key: rowKey(), name: "", start_date: "", stop_date: "" });
export const emptyHistory = (): HistoryRow => ({ key: rowKey(), condition: "", present: "unknown" });

export function emptyForm(): PatientFormState {
  return { label: "", age: "", sex: "", date_of_birth: "", as_of: "", labs: [], diagnoses: [], medications: [], history: [] };
}

const SEXES: Sex[] = ["male", "female", "other", "unknown"];
const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export function profileToForm(label: string, p: PatientProfileInput): PatientFormState {
  const d = p.demographics ?? {};
  return {
    label,
    age: s(d.age),
    sex: d.sex && SEXES.includes(d.sex) ? d.sex : "",
    date_of_birth: s(d.date_of_birth),
    as_of: s(p.as_of),
    labs: (p.labs ?? []).map((l) => ({
      key: rowKey(),
      name: s(l.name),
      value: s(l.value),
      unit: s(l.unit),
      observed_at: s(l.observed_at),
      reference_range: s(l.reference_range),
    })),
    diagnoses: (p.diagnoses ?? []).map((x) => ({ key: rowKey(), name: s(x.name), code: s(x.code), documented_at: s(x.documented_at) })),
    medications: (p.medications ?? []).map((m) => ({ key: rowKey(), name: s(m.name), start_date: s(m.start_date), stop_date: s(m.stop_date) })),
    history: (p.history ?? []).map((h) => ({
      key: rowKey(),
      condition: s(h.condition),
      present: h.present === true ? "yes" : h.present === false ? "no" : "unknown",
    })),
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const t = (v: string): string => v.trim();

function isBlankLab(r: LabRow) {
  return !t(r.name) && !t(r.value) && !t(r.unit) && !t(r.observed_at) && !t(r.reference_range);
}
function isBlankDx(r: DiagnosisRow) {
  return !t(r.name) && !t(r.code) && !t(r.documented_at);
}
function isBlankMed(r: MedicationRow) {
  return !t(r.name) && !t(r.start_date) && !t(r.stop_date);
}
function isBlankHx(r: HistoryRow) {
  return !t(r.condition) && r.present === "unknown";
}

function parseNumber(v: string): number | null {
  const trimmed = t(v);
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export interface BuildResult {
  profile: PatientProfileInput | null;
  errors: string[];
}

/** Convert form state to a backend-valid PatientProfileInput, or list blocking errors. */
export function formToProfile(f: PatientFormState): BuildResult {
  const errors: string[] = [];
  const checkDate = (v: string, what: string) => {
    if (t(v) && !DATE_RE.test(t(v))) errors.push(`${what} must be a date (YYYY-MM-DD).`);
  };

  const demographics: PatientProfileInput["demographics"] = {};
  if (t(f.age)) {
    const age = parseNumber(f.age);
    if (age === null || age < 0 || age > 130) errors.push("Age must be a number between 0 and 130.");
    else demographics.age = age;
  }
  if (f.sex) demographics.sex = f.sex;
  if (t(f.date_of_birth)) {
    checkDate(f.date_of_birth, "Date of birth");
    demographics.date_of_birth = t(f.date_of_birth);
  }

  const labs: LabInput[] = [];
  f.labs.forEach((r, i) => {
    if (isBlankLab(r)) return;
    const n = `Lab ${i + 1}${t(r.name) ? ` (${t(r.name)})` : ""}`;
    if (!t(r.name)) errors.push(`${n}: name is required.`);
    const value = parseNumber(r.value);
    if (value === null) errors.push(`${n}: value must be a number.`);
    checkDate(r.observed_at, `${n} observed date`);
    if (t(r.name) && value !== null) {
      const lab: LabInput = { name: t(r.name), value };
      if (t(r.unit)) lab.unit = t(r.unit);
      if (t(r.observed_at)) lab.observed_at = t(r.observed_at);
      if (t(r.reference_range)) lab.reference_range = t(r.reference_range);
      labs.push(lab);
    }
  });

  const diagnoses: DiagnosisInput[] = [];
  f.diagnoses.forEach((r, i) => {
    if (isBlankDx(r)) return;
    if (!t(r.name)) {
      errors.push(`Diagnosis ${i + 1}: name is required.`);
      return;
    }
    checkDate(r.documented_at, `Diagnosis ${i + 1} documented date`);
    const dx: DiagnosisInput = { name: t(r.name) };
    if (t(r.code)) dx.code = t(r.code);
    if (t(r.documented_at)) dx.documented_at = t(r.documented_at);
    diagnoses.push(dx);
  });

  const medications: MedicationInput[] = [];
  f.medications.forEach((r, i) => {
    if (isBlankMed(r)) return;
    if (!t(r.name)) {
      errors.push(`Medication ${i + 1}: name is required.`);
      return;
    }
    checkDate(r.start_date, `Medication ${i + 1} start date`);
    checkDate(r.stop_date, `Medication ${i + 1} stop date`);
    if (t(r.start_date) && t(r.stop_date) && t(r.stop_date) < t(r.start_date)) {
      errors.push(`Medication ${i + 1}: stop date is before start date.`);
    }
    const med: MedicationInput = { name: t(r.name) };
    if (t(r.start_date)) med.start_date = t(r.start_date);
    if (t(r.stop_date)) med.stop_date = t(r.stop_date);
    medications.push(med);
  });

  const history: HistoryInput[] = [];
  f.history.forEach((r, i) => {
    if (isBlankHx(r)) return;
    if (!t(r.condition)) {
      errors.push(`History ${i + 1}: condition is required.`);
      return;
    }
    history.push({ condition: t(r.condition), present: r.present === "yes" ? true : r.present === "no" ? false : null });
  });

  if (t(f.as_of)) checkDate(f.as_of, "Assessment date");

  if (errors.length > 0) return { profile: null, errors };
  const profile: PatientProfileInput = { demographics, labs, diagnoses, medications, history };
  if (t(f.as_of)) profile.as_of = t(f.as_of);
  return { profile, errors };
}

/** Recommended-but-missing fields, shown as text so it is not conveyed by color alone. */
export function missingRecommended(f: PatientFormState): string[] {
  const out: string[] = [];
  if (!t(f.label)) out.push("label");
  if (!t(f.age)) out.push("age");
  if (!f.sex) out.push("sex");
  if (!t(f.as_of)) out.push("assessment date (as of)");
  f.labs.forEach((r, i) => {
    if (isBlankLab(r)) return;
    const n = t(r.name) || `lab ${i + 1}`;
    if (!t(r.unit)) out.push(`${n}: unit`);
    if (!t(r.observed_at)) out.push(`${n}: date`);
  });
  if (f.labs.filter((r) => !isBlankLab(r)).length === 0) out.push("labs (none entered)");
  return out;
}

// ------------------------------------------------------------------ JSON import

const PROFILE_KEYS = new Set(["demographics", "labs", "diagnoses", "medications", "history", "as_of"]);

export interface JsonImport {
  label: string | null;
  profile: PatientProfileInput;
}

/**
 * Parse pasted JSON. Accepts either a PatientProfileInput or a {label, profile} wrapper.
 * Throws an Error with a readable message on invalid input.
 */
export function parseProfileJson(text: string): JsonImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : "parse error"}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("JSON must be an object (a patient profile).");
  }
  let obj = data as Record<string, unknown>;
  let label: string | null = null;
  if ("profile" in obj) {
    if (typeof obj["label"] === "string") label = obj["label"];
    const inner = obj["profile"];
    if (typeof inner !== "object" || inner === null || Array.isArray(inner)) throw new Error("`profile` must be an object.");
    obj = inner as Record<string, unknown>;
  }
  const unknown = Object.keys(obj).filter((k) => !PROFILE_KEYS.has(k));
  if (unknown.length > 0) {
    throw new Error(`Unknown field(s): ${unknown.join(", ")}. Allowed: ${Array.from(PROFILE_KEYS).join(", ")}.`);
  }
  for (const k of ["labs", "diagnoses", "medications", "history"]) {
    if (k in obj && obj[k] !== null && !Array.isArray(obj[k])) throw new Error(`\`${k}\` must be an array.`);
  }
  if ("demographics" in obj && obj["demographics"] !== null && (typeof obj["demographics"] !== "object" || Array.isArray(obj["demographics"]))) {
    throw new Error("`demographics` must be an object.");
  }
  const demo = obj["demographics"] as Record<string, unknown> | null | undefined;
  const sex = demo?.["sex"];
  if (sex !== undefined && sex !== null && !(SEXES as unknown[]).includes(sex)) {
    throw new Error(`demographics.sex must be one of: ${SEXES.join(", ")}.`);
  }
  return { label, profile: obj as PatientProfileInput };
}
