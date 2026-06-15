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
