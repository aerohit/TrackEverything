import { assertEquals } from "@std/assert";
import { MockClaudeClient } from "../../src/claude.ts";
import { extractEvents, parseCandidates } from "../../src/extract.ts";

const now = new Date("2026-06-12T12:00:00Z");

// Golden fixture: the model's JSON for "coffee and my magnesium at 10am". We
// assert on structure/properties, not prose, so it stays robust (R-TEST-3).
const coffeeAndMagnesium = {
  events: [
    {
      category: "drink",
      fields: { item: "coffee", caffeine_mg: 120 },
      rawPhrase: "coffee",
      time: { type: "absolute", iso: "2026-06-12T10:00:00Z" },
    },
    {
      category: "supplement",
      fields: { item: "magnesium", dose_mg: 400 },
      rawPhrase: "my magnesium",
      time: { type: "absolute", iso: "2026-06-12T10:00:00Z" },
    },
  ],
};

Deno.test("extractEvents: one utterance yields multiple candidates", async () => {
  const claude = new MockClaudeClient(undefined, coffeeAndMagnesium);
  const candidates = await extractEvents(claude, {
    transcript: "coffee and my magnesium at 10am",
    now,
  });

  assertEquals(candidates.length, 2);
  assertEquals(candidates.map((c) => c.category), ["drink", "supplement"]);
  assertEquals(candidates.every((c) => c.source === "voice"), true);
  assertEquals((candidates[0].occurredAt as Date).toISOString(), "2026-06-12T10:00:00.000Z");
  assertEquals(candidates[0].occurredAtConfidence, "high");
  assertEquals(candidates[1].fields, { item: "magnesium", dose_mg: 400 });
});

Deno.test("parseCandidates: resolves relative time and defaults missing time", () => {
  const candidates = parseCandidates({
    events: [
      {
        category: "breathwork",
        rawPhrase: "box breathing an hour ago",
        time: { type: "relative_minutes", minutesAgo: 60 },
      },
      { category: "mood", fields: { rating: 3 }, rawPhrase: "feeling ok" },
    ],
  }, now);

  assertEquals(candidates.length, 2);
  assertEquals((candidates[0].occurredAt as Date).toISOString(), "2026-06-12T11:00:00.000Z");
  assertEquals(candidates[0].occurredAtConfidence, "inferred");
  assertEquals((candidates[1].occurredAt as Date).getTime(), now.getTime());
  assertEquals(candidates[1].occurredAtConfidence, "inferred");
});

Deno.test("parseCandidates: tolerates malformed model output", () => {
  assertEquals(parseCandidates({}, now), []);
  assertEquals(parseCandidates({ events: "nope" }, now), []);
  assertEquals(parseCandidates(null, now), []);
});
