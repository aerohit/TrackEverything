/**
 * Phase 6: assemble the recent timeline into a compact, citable context for the
 * LLM. Pure functions (unit-tested): select the time window, format each event
 * with a stable `[E#]` reference so the model can cite what it used (R-RT-6), and
 * merge in optional baselines.
 */
import type { EventRow } from "./events.ts";

export const DEFAULT_WINDOW_HOURS = 48;

export interface ContextRef {
  ref: string;
  event: EventRow;
}

export interface AssembledContext {
  text: string;
  /** `[E#]` → event, for resolving the model's citations back to event ids. */
  index: ContextRef[];
}

/** Events whose occurred_at falls within [now - windowHours, now], oldest first. */
export function selectWindow(events: EventRow[], now: Date, windowHours: number): EventRow[] {
  const from = now.getTime() - windowHours * 60 * 60 * 1000;
  const to = now.getTime();
  return events
    .filter((e) => {
      const t = new Date(e.occurred_at).getTime();
      return t >= from && t <= to;
    })
    .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
}

/**
 * Build the context string + citation index. `baselines` is optional personal
 * context (e.g. "usual: ~2 coffees, sleep ~7h"); included when provided.
 */
export function assembleContext(args: {
  events: EventRow[];
  now: Date;
  windowHours?: number;
  baselines?: string;
}): AssembledContext {
  const windowHours = args.windowHours ?? DEFAULT_WINDOW_HOURS;
  const windowed = selectWindow(args.events, args.now, windowHours);
  const index: ContextRef[] = windowed.map((event, i) => ({ ref: `E${i + 1}`, event }));

  const header = `Now: ${args.now.toISOString()}\nWindow: last ${windowHours}h`;
  const baselines = args.baselines && args.baselines.trim() !== ""
    ? `\n\nBaselines:\n${args.baselines.trim()}`
    : "";
  const timeline = index.length === 0
    ? "\n\nTimeline: (no events in this window)"
    : `\n\nTimeline (oldest first):\n${
      index.map(({ ref, event }) => `${ref} ${formatEvent(event)}`).join("\n")
    }`;

  return { text: `${header}${baselines}${timeline}`, index };
}

function formatEvent(event: EventRow): string {
  const when = new Date(event.occurred_at).toISOString();
  const parts = [when, event.category];
  if (event.fields && Object.keys(event.fields).length > 0) {
    parts.push(JSON.stringify(event.fields));
  }
  if (event.raw_text) parts.push(`"${event.raw_text}"`);
  return parts.join("  ");
}
