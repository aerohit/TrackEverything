import { assertEquals } from "@std/assert";
import { buildCheckinEvents, validateCheckin } from "../../src/checkins.ts";

const now = new Date("2026-06-12T12:00:00Z");

Deno.test("validateCheckin: accepts a valid multi-dimension check-in", () => {
  assertEquals(validateCheckin({ mood: 4, energy: 2, focus: 3 }), []);
});

Deno.test("validateCheckin: requires at least one dimension", () => {
  const errors = validateCheckin({});
  assertEquals(errors.some((e) => e.includes("at least one")), true);
});

Deno.test("validateCheckin: rejects out-of-range and non-integer ratings", () => {
  assertEquals(validateCheckin({ mood: 6 }).length, 1);
  assertEquals(validateCheckin({ energy: 0 }).length, 1);
  assertEquals(validateCheckin({ focus: 2.5 }).length, 1);
});

Deno.test("validateCheckin: rejects an invalid occurredAt", () => {
  const errors = validateCheckin({ mood: 3, occurredAt: "not-a-date" });
  assertEquals(errors.some((e) => e.includes("occurredAt")), true);
});

Deno.test("buildCheckinEvents: one event per provided dimension", () => {
  const events = buildCheckinEvents({ mood: 4, focus: 2, note: "post-lunch dip" }, now);
  assertEquals(events.length, 2);
  assertEquals(events.map((e) => e.category), ["mood", "focus"]);
  assertEquals(events[0].fields, { rating: 4 });
  assertEquals(events[1].fields, { rating: 2 });
  assertEquals(events.every((e) => e.source === "manual"), true);
  assertEquals(events.every((e) => (e.occurredAt as Date).getTime() === now.getTime()), true);
  assertEquals(events[0].rawText, "post-lunch dip");
});

Deno.test("buildCheckinEvents: honours an explicit occurredAt", () => {
  const events = buildCheckinEvents({ energy: 3, occurredAt: "2026-06-12T08:00:00Z" }, now);
  assertEquals(events.length, 1);
  assertEquals(events[0].category, "energy");
  assertEquals(events[0].occurredAt, "2026-06-12T08:00:00Z");
});
