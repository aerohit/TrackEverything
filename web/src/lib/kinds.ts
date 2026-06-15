import type { SubjectiveKind } from "$lib/types";

export interface KindMeta {
  kind: SubjectiveKind;
  label: string;
  /** CSS custom property for this series' color. */
  color: string;
}

/** UI metadata for the subjective states currently tracked (mood/energy/focus). */
export const KINDS: KindMeta[] = [
  { kind: "mood", label: "Mood", color: "var(--mood)" },
  { kind: "energy", label: "Energy", color: "var(--energy)" },
  { kind: "focus", label: "Focus", color: "var(--focus)" },
];
