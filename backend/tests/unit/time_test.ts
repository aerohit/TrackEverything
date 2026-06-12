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
