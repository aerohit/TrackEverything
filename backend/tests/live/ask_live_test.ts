import { assert } from "@std/assert";
import { AnthropicClaudeClient } from "../../src/claude.ts";
import { answerQuestion } from "../../src/ask.ts";
import { makeEvent } from "../helpers/events.ts";

// Real reasoning over a fixed timeline. Run with `deno task test:live` and
// ANTHROPIC_API_KEY set; skipped without it. No DB needed.
const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
const model = Deno.env.get("CLAUDE_MODEL") ?? "claude-opus-4-8";

Deno.test({
  name: "live: answers 'what's dragging me down?' and cites timeline events",
  ignore: !apiKey,
  async fn() {
    const now = new Date("2026-06-12T18:00:00Z");
    const events = [
      makeEvent({
        occurred_at: new Date("2026-06-12T03:00:00Z"),
        category: "sleep",
        fields: { duration_min: 320 },
      }),
      makeEvent({
        occurred_at: new Date("2026-06-12T16:30:00Z"),
        category: "drink",
        fields: { item: "coffee", caffeine_mg: 200 },
      }),
      makeEvent({
        occurred_at: new Date("2026-06-12T17:00:00Z"),
        category: "energy",
        fields: { rating: 2 },
      }),
    ];

    const claude = new AnthropicClaudeClient(apiKey!, model);
    const result = await answerQuestion(claude, {
      templateId: "whats_dragging_me_down",
      events,
      now,
      windowHours: 48,
    });

    assert(result.answer.trim().length > 0, "expected a non-empty answer");
    assert(result.citedEvents.length >= 1, "expected at least one cited event");
  },
});

if (!apiKey) {
  console.info("[ask_live_test] ANTHROPIC_API_KEY not set — skipping live reasoning test.");
}
