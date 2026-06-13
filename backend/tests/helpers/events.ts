import type { EventRow } from "../../src/events.ts";

/** Build an EventRow for tests, with sensible defaults. */
export function makeEvent(p: Partial<EventRow> & { occurred_at: Date }): EventRow {
  return {
    id: p.id ?? crypto.randomUUID(),
    category: p.category ?? "note",
    occurred_at: p.occurred_at,
    recorded_at: p.recorded_at ?? p.occurred_at,
    occurred_at_confidence: p.occurred_at_confidence ?? "high",
    source: p.source ?? "manual",
    fields: p.fields ?? {},
    raw_text: p.raw_text ?? null,
    template_id: p.template_id ?? null,
    item_id: p.item_id ?? null,
    created_at: p.created_at ?? p.occurred_at,
  };
}
