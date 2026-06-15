/**
 * Client-side mirror of the server's Subjective State contract
 * (../../shared/subjective_state.ts). The shared Zod schema remains the runtime
 * source of truth — the server validates every request against it — so this is
 * a thin type-only copy that keeps the web build inside the Node/Vite world
 * (no cross-boundary import of the Deno/zod module). Keep the two in sync.
 */
export const SUBJECTIVE_KINDS = ["mood", "energy", "focus"] as const;
export type SubjectiveKind = (typeof SUBJECTIVE_KINDS)[number];

export interface Reading {
  kind: SubjectiveKind;
  rating: number;
}

export interface CreateCheckin {
  readings: Reading[];
  note?: string;
}

export interface Checkin {
  id: string;
  kind: SubjectiveKind;
  rating: number;
  note: string | null;
  recordedAt: string;
}

// ---- Inputs domain (mirrors ../../shared/inputs.ts; server is authoritative) ----

export type SubstanceUnit = "g" | "mg" | "mcg" | "ml" | "kcal" | "iu";
export type Confidence = "high" | "medium" | "low" | "unknown";

export interface ResolvedAmount {
  substance: string;
  amount: number;
  unit: SubstanceUnit;
  confidence: Confidence;
  source: string;
}

export interface IntakeEvent {
  id: string;
  occurredAt: string;
  displayName: string;
  itemId: string | null;
  quantity: number;
  unit: string;
  canonicalQuantity: number | null;
  canonicalUnit: string | null;
  confidence: Confidence;
  contextTags: string[];
  notes: string | null;
  resolved: ResolvedAmount[];
}

export interface DailyTotal {
  substance: string;
  amount: number;
  unit: SubstanceUnit;
}

export interface InputItemSummary {
  id: string;
  name: string;
  kind: "product" | "recipe" | "simple";
  primaryType: string;
  roles: string[];
  brand: string | null;
  defaultDisplayQuantity: number | null;
  defaultDisplayUnit: string | null;
  defaultCanonicalQuantity: number | null;
  defaultCanonicalUnit: string | null;
}

export interface CreateIntake {
  displayName: string;
  itemId?: string;
  quantity: number;
  unit: string;
  occurredAt?: string;
  contextTags?: string[];
  notes?: string;
}
