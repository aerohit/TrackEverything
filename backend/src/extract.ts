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
  /**
   * The client's UTC offset in minutes, east-positive (the negation of JS's
   * `Date.prototype.getTimezoneOffset`, so UTC+2 → +120). Clock times the user
   * mentions are interpreted in this zone (R-CAP-8). Defaults to 0 (UTC).
   */
  tzOffsetMinutes?: number;
}

/** Does an ISO string carry its own timezone (a trailing `Z` or `±hh:mm`)? */
function hasExplicitZone(iso: string): boolean {
  return /([zZ]|[+\-]\d{2}:?\d{2})$/.test(iso.trim());
}

/**
 * Parse a clock time the user named. If it already carries a timezone we trust
 * it; otherwise it's a **local wall-clock** ("6pm" → "2026-06-13T18:00:00") and
 * we apply the user's offset so the stored instant is correct. We own this math
 * (rather than asking the model to do offset arithmetic) so it's deterministic.
 */
function parseAbsolute(iso: string, tzOffsetMinutes: number): Date {
  const s = iso.trim();
  if (hasExplicitZone(s)) return new Date(s);
  // Read the wall-clock as if it were UTC, then shift back by the offset:
  // local 18:00 at UTC+2 is the instant 16:00Z.
  return new Date(new Date(s + "Z").getTime() - tzOffsetMinutes * 60_000);
}

/**
 * Resolve a time hint to a concrete instant + confidence (pure; fixed-now
 * testable). Explicit/clock times are "high"; anything we had to infer or
 * default is "inferred". `tzOffsetMinutes` (east-positive) places bare
 * wall-clock times in the user's local zone.
 */
export function resolveOccurredAt(
  hint: TimeHint,
  now: Date,
  tzOffsetMinutes = 0,
): { occurredAt: Date; confidence: OccurredAtConfidence } {
  switch (hint.type) {
    case "now":
      return { occurredAt: now, confidence: "high" };
    case "absolute":
      return { occurredAt: parseAbsolute(hint.iso, tzOffsetMinutes), confidence: "high" };
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
export function parseCandidates(raw: unknown, now: Date, tzOffsetMinutes = 0): NewEvent[] {
  const events = isRecord(raw) ? raw.events : undefined;
  if (!Array.isArray(events)) return [];
  return events.map((entry) => toCandidate(isRecord(entry) ? entry : {}, now, tzOffsetMinutes));
}

function toCandidate(c: RawCandidate, now: Date, tzOffsetMinutes: number): NewEvent {
  const { occurredAt, confidence } = resolveOccurredAt(asTimeHint(c.time), now, tzOffsetMinutes);
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
  const tz = input.tzOffsetMinutes ?? 0;
  const raw = await claude.extractJson({
    system: buildSystemPrompt(input.knownItems ?? []),
    user: buildUserPrompt(input.transcript, input.now, tz),
  });
  return parseCandidates(raw, input.now, tz);
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
    {"type":"absolute","iso":"YYYY-MM-DDTHH:MM:SS"} — an explicit clock time/date the
      user named ("6pm", "this morning", "yesterday at 8"). Express it as the user's
      LOCAL wall-clock time with NO timezone suffix (no trailing "Z" or "+hh:mm") — just
      the time as they would read it off a clock. Use the provided current local date to
      fill in the day,
    {"type":"relative_minutes","minutesAgo":<number>} — phrasing like "an hour ago",
    {"type":"unknown"} — no time information at all.${itemsBlock}`;
}

/** Format an east-positive minute offset as `+HH:MM` / `-HH:MM`. */
function formatOffset(tzOffsetMinutes: number): string {
  const sign = tzOffsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(tzOffsetMinutes);
  const p = (n: number) => (n < 10 ? "0" : "") + n;
  return `${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
}

export function buildUserPrompt(transcript: string, now: Date, tzOffsetMinutes = 0): string {
  const localNow = new Date(now.getTime() + tzOffsetMinutes * 60_000).toISOString().slice(0, 19);
  return `Current local date & time: ${localNow} (the user's timezone, UTC${
    formatOffset(tzOffsetMinutes)
  }). Interpret every clock time the user mentions in THIS local timezone and report it
as a local wall-clock time (see the "absolute" format above).

Transcript:
${transcript}`;
}
