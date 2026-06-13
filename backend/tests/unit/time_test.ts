import { assertEquals } from "@std/assert";
import { resolveOccurredAt } from "../../src/extract.ts";

const now = new Date("2026-06-12T12:00:00Z");

Deno.test("resolveOccurredAt: now -> now, high confidence", () => {
  const r = resolveOccurredAt({ type: "now" }, now);
  assertEquals(r.occurredAt.getTime(), now.getTime());
  assertEquals(r.confidence, "high");
});

Deno.test("resolveOccurredAt: absolute -> parsed instant, high confidence", () => {
  const r = resolveOccurredAt({ type: "absolute", iso: "2026-06-12T10:00:00Z" }, now);
  assertEquals(r.occurredAt.toISOString(), "2026-06-12T10:00:00.000Z");
  assertEquals(r.confidence, "high");
});

Deno.test("resolveOccurredAt: relative_minutes -> now minus minutes, inferred", () => {
  const r = resolveOccurredAt({ type: "relative_minutes", minutesAgo: 60 }, now);
  assertEquals(r.occurredAt.toISOString(), "2026-06-12T11:00:00.000Z");
  assertEquals(r.confidence, "inferred");
});

Deno.test("resolveOccurredAt: unknown -> now, inferred", () => {
  const r = resolveOccurredAt({ type: "unknown" }, now);
  assertEquals(r.occurredAt.getTime(), now.getTime());
  assertEquals(r.confidence, "inferred");
});

Deno.test("resolveOccurredAt: bare wall-clock is read in the user's timezone (UTC+2)", () => {
  // "6pm" said in UTC+2 is the instant 16:00Z, not 18:00Z.
  const r = resolveOccurredAt({ type: "absolute", iso: "2026-06-13T18:00:00" }, now, 120);
  assertEquals(r.occurredAt.toISOString(), "2026-06-13T16:00:00.000Z");
  assertEquals(r.confidence, "high");
});

Deno.test("resolveOccurredAt: bare wall-clock west of UTC (UTC-5)", () => {
  // 9am said in UTC-5 is 14:00Z.
  const r = resolveOccurredAt({ type: "absolute", iso: "2026-06-13T09:00:00" }, now, -300);
  assertEquals(r.occurredAt.toISOString(), "2026-06-13T14:00:00.000Z");
});

Deno.test("resolveOccurredAt: an explicit-zone time is trusted, offset ignored", () => {
  const r = resolveOccurredAt({ type: "absolute", iso: "2026-06-13T18:00:00Z" }, now, 120);
  assertEquals(r.occurredAt.toISOString(), "2026-06-13T18:00:00.000Z");
});

Deno.test("resolveOccurredAt: no offset (UTC) treats wall-clock as UTC", () => {
  const r = resolveOccurredAt({ type: "absolute", iso: "2026-06-13T18:00:00" }, now);
  assertEquals(r.occurredAt.toISOString(), "2026-06-13T18:00:00.000Z");
});
