import { assertEquals } from "@std/assert";
import { type NewEvent, validateNewEvent } from "../../src/events.ts";

const valid: NewEvent = {
  category: "drink",
  occurredAt: "2026-06-12T10:00:00Z",
  source: "manual",
  fields: { caffeine_mg: 120 },
};

Deno.test("validateNewEvent: accepts a valid event", () => {
  assertEquals(validateNewEvent(valid), []);
});

Deno.test("validateNewEvent: rejects an unknown category", () => {
  const errors = validateNewEvent({ ...valid, category: "telepathy" });
  assertEquals(errors.some((e) => e.includes("category")), true);
});

Deno.test("validateNewEvent: rejects an invalid occurredAt", () => {
  const errors = validateNewEvent({ ...valid, occurredAt: "not-a-date" });
  assertEquals(errors.some((e) => e.includes("occurredAt")), true);
});

Deno.test("validateNewEvent: rejects an unknown source", () => {
  const errors = validateNewEvent({ ...valid, source: "telegram" });
  assertEquals(errors.some((e) => e.includes("source")), true);
});

Deno.test("validateNewEvent: rejects non-object fields", () => {
  const errors = validateNewEvent({
    ...valid,
    fields: [1, 2] as unknown as Record<string, unknown>,
  });
  assertEquals(errors.some((e) => e.includes("fields")), true);
});

Deno.test("validateNewEvent: rejects invalid confidence", () => {
  const errors = validateNewEvent({
    ...valid,
    occurredAtConfidence: "maybe" as unknown as "high",
  });
  assertEquals(errors.some((e) => e.includes("occurredAtConfidence")), true);
});

Deno.test("validateNewEvent: accepts an inferred after-the-fact event", () => {
  const errors = validateNewEvent({
    ...valid,
    recordedAt: "2026-06-12T15:30:00Z",
    occurredAtConfidence: "inferred",
  });
  assertEquals(errors, []);
});
