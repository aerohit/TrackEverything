import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type { AdviceContext } from "../shared/advice.ts";
import { buildAdvicePrompt, summarizeContext } from "./advise.ts";

const ctx: AdviceContext = {
  now: "2026-06-16T20:00:00.000Z",
  windowHours: 48,
  checkins: [
    { id: "1", kind: "energy", rating: 2, note: "groggy", recordedAt: "2026-06-16T15:00:00.000Z" },
    { id: "2", kind: "mood", rating: 3, note: null, recordedAt: "2026-06-16T15:00:00.000Z" },
  ],
  events: [
    {
      id: "e1",
      occurredAt: "2026-06-16T14:30:00.000Z",
      displayName: "Cold brew",
      itemId: null,
      quantity: 1,
      unit: "cup",
      canonicalQuantity: null,
      canonicalUnit: null,
      confidence: "medium",
      contextTags: ["afternoon"],
      notes: null,
      resolved: [{
        substance: "caffeine",
        amount: 200,
        unit: "mg",
        confidence: "medium",
        source: "manual",
      }],
    },
  ],
  totals: [{ substance: "caffeine", substanceType: "stimulant", amount: 200, unit: "mg" }],
};

Deno.test("summarizeContext: includes window, check-ins, intake (+resolved/tags), and totals", () => {
  const s = summarizeContext(ctx);
  assertStringIncludes(s, "last 48 hours");
  assertStringIncludes(s, "2026-06-16 15:00 — energy 2/5 (groggy)");
  assertStringIncludes(s, "2026-06-16 15:00 — mood 3/5");
  assertStringIncludes(s, "2026-06-16 14:30 — Cold brew, 1 cup [caffeine 200mg] #afternoon");
  assertStringIncludes(s, "caffeine: 200 mg");
});

Deno.test("summarizeContext: marks empty sections rather than omitting them", () => {
  const empty = summarizeContext({ ...ctx, checkins: [], events: [], totals: [] });
  assertStringIncludes(empty, "Subjective check-ins (most recent first):\n- (none logged)");
  assertStringIncludes(empty, "Intake (most recent first):\n- (none logged)");
  assertStringIncludes(empty, "Per-substance totals over the window:\n- (none)");
});

Deno.test("buildAdvicePrompt: pairs the system prompt with the context + question", () => {
  const { system, user } = buildAdvicePrompt(ctx, "  Why is my energy low?  ");
  assert(system.includes("wellness assistant"));
  assert(system.includes("not medical advice"));
  assertStringIncludes(user, "caffeine 200mg");
  // The question is trimmed and appended.
  assertStringIncludes(user, "My question: Why is my energy low?");
  assertEquals(user.includes("  Why is my energy low?  "), false);
});
