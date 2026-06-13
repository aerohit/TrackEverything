import { assertEquals } from "@std/assert";
import { MockClaudeClient } from "../../src/claude.ts";
import { answerQuestion, buildAskPrompt, parseAnswer, resolveCitations } from "../../src/ask.ts";
import type { ContextRef } from "../../src/context.ts";
import { makeEvent } from "../helpers/events.ts";

const now = new Date("2026-06-12T12:00:00Z");

Deno.test("parseAnswer: extracts answer + citations, tolerates junk", () => {
  assertEquals(parseAnswer({ answer: "x", citations: ["E1", "E2"] }), {
    answer: "x",
    citations: ["E1", "E2"],
  });
  assertEquals(parseAnswer({}), { answer: "", citations: [] });
  assertEquals(parseAnswer(null), { answer: "", citations: [] });
  assertEquals(parseAnswer({ answer: "x", citations: ["E1", 5] }), {
    answer: "x",
    citations: ["E1"],
  });
});

Deno.test("resolveCitations: splits matched and unmatched refs", () => {
  const e = makeEvent({ occurred_at: now, category: "drink" });
  const index: ContextRef[] = [{ ref: "E1", event: e }];
  const { citedEvents, unmatched } = resolveCitations(["E1", "E9"], index);
  assertEquals(citedEvents.map((c) => c.id), [e.id]);
  assertEquals(unmatched, ["E9"]);
});

Deno.test("buildAskPrompt: throws on an unknown template", () => {
  let threw = false;
  try {
    buildAskPrompt("nope", "ctx");
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("answerQuestion: resolves the model's citations to events (fixture)", async () => {
  const sleep = makeEvent({
    occurred_at: new Date("2026-06-12T07:00:00Z"),
    category: "sleep",
    fields: { duration_min: 340 },
  });
  const coffee = makeEvent({
    occurred_at: new Date("2026-06-12T11:00:00Z"),
    category: "drink",
    fields: { item: "coffee", caffeine_mg: 200 },
  });
  const claude = new MockClaudeClient(undefined, {
    answer: "Short sleep plus late, strong caffeine.",
    citations: ["E1", "E2"],
  });

  const result = await answerQuestion(claude, {
    templateId: "whats_dragging_me_down",
    events: [coffee, sleep], // unordered on input
    now,
    windowHours: 48,
  });

  assertEquals(result.answer.length > 0, true);
  // E1 = oldest (sleep), E2 = coffee.
  assertEquals(result.citedEvents.map((c) => c.id), [sleep.id, coffee.id]);
  assertEquals(result.unmatchedCitations, []);
});
