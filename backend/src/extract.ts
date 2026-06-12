/**
 * Phase 3: turn a free-text transcript into structured candidate events.
 *
 * The LLM does the messy NL→structure mapping; our code owns the deterministic
 * parts so they're unit-testable: relative-time resolution against a fixed "now"
 * (R-CAP-8) and mapping the model's JSON into validated candidates. Candidates
 * are NOT persisted here — they go back for a confirmation step (R-CAP-9).
 */
import type { ClaudeClient } from "./claude.ts";
import type { NewEvent } from "./events.ts";
import { CATEGORIES, type OccurredAtConfidence } from "./vocab.ts";

/** A personal item the model can resolve shorthand against ("my coffee"). */
export interface KnownItem {
  name: string;
  category: string;
  defaultFields?: Record<string, unknown>;
}

/** How the model conveys when an event happened, relative to a known "now". */
export type TimeHint =
  | { type: "now" }
  | { type: "absolute"; iso: string }
  | { type: "relative_minutes"; minutesAgo: number }
  | { type: "unknown" };

export interface ExtractionInput {
  transcript: string;
  now: Date;
  knownItems?: KnownItem[];
}

/**
 * Resolve a time hint to a concrete instant + confidence (pure; fixed-now
 * testable). Explicit/clock times are "high"; anything we had to infer or
 * default is "inferred".
 */
export function resolveOccurredAt(
  hint: TimeHint,
  now: Date,
): { occurredAt: Date; confidence: OccurredAtConfidence } {
  switch (hint.type) {
    case "now":
      return { occurredAt: now, confidence: "high" };
    case "absolute":
      return { occurredAt: new Date(hint.iso), confidence: "high" };
    case "relative_minutes":
      return {
        occurredAt: new Date(now.getTime() - hint.minutesAgo * 60_000),
        confidence: "inferred",
      };
    case "unknown":
      return { occurredAt: now, confidence: "inferred" };
  }
}

interface RawCandidate {
  category?: unknown;
  fields?: unknown;
  rawPhrase?: unknown;
  time?: unknown;
}

/** Map the model's JSON ({events:[...]}) into candidate NewEvents. */
export function parseCandidates(raw: unknown, now: Date): NewEvent[] {
  const events = isRecord(raw) ? raw.events : undefined;
  if (!Array.isArray(events)) return [];
  return events.map((entry) => toCandidate(isRecord(entry) ? entry : {}, now));
}

function toCandidate(c: RawCandidate, now: Date): NewEvent {
  const { occurredAt, confidence } = resolveOccurredAt(asTimeHint(c.time), now);
  return {
    category: typeof c.category === "string" ? c.category : "",
    occurredAt,
    occurredAtConfidence: confidence,
    source: "voice",
    fields: isRecord(c.fields) ? c.fields : {},
    rawText: typeof c.rawPhrase === "string" ? c.rawPhrase : null,
  };
}

function asTimeHint(value: unknown): TimeHint {
  if (!isRecord(value)) return { type: "unknown" };
  if (value.type === "now") return { type: "now" };
  if (value.type === "absolute" && typeof value.iso === "string") {
    return { type: "absolute", iso: value.iso };
  }
  if (value.type === "relative_minutes" && typeof value.minutesAgo === "number") {
    return { type: "relative_minutes", minutesAgo: value.minutesAgo };
  }
  return { type: "unknown" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Ask the model to extract events from the transcript, then parse the result. */
export async function extractEvents(
  claude: ClaudeClient,
  input: ExtractionInput,
): Promise<NewEvent[]> {
  const raw = await claude.extractJson({
    system: buildSystemPrompt(input.knownItems ?? []),
    user: buildUserPrompt(input.transcript, input.now),
  });
  return parseCandidates(raw, input.now);
}

export function buildSystemPrompt(knownItems: KnownItem[]): string {
  const itemsBlock = knownItems.length === 0 ? "" : `

Known personal items (resolve shorthand to these; apply their default fields):
${
    knownItems.map((i) =>
      `- "${i.name}" → category ${i.category}${
        i.defaultFields ? ` defaults ${JSON.stringify(i.defaultFields)}` : ""
      }`
    ).join("\n")
  }`;

  return `You extract structured health-tracking events from a short transcript of
someone logging things that affect their mood, energy, and focus.

Return ONLY a JSON object: {"events": [ ... ]}. One utterance may contain several
events (e.g. "coffee and my magnesium" is two). For each event emit:
- "category": one of ${CATEGORIES.join(", ")}.
- "fields": an object of structured details using canonical keys where they apply
  (caffeine_mg, dose_mg, servings, duration_min, intensity, rating, item).
- "rawPhrase": the exact words from the transcript for this event.
- "time": when it happened, as one of:
    {"type":"now"} — just now / no past reference,
    {"type":"absolute","iso":"<ISO-8601>"} — an explicit clock time/date; compute
      the full ISO timestamp from the provided current time,
    {"type":"relative_minutes","minutesAgo":<number>} — phrasing like "an hour ago",
    {"type":"unknown"} — no time information at all.${itemsBlock}`;
}

export function buildUserPrompt(transcript: string, now: Date): string {
  return `Current time (ISO-8601): ${now.toISOString()}

Transcript:
${transcript}`;
}
