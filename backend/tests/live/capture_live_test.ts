import { assert } from "@std/assert";
import { AnthropicClaudeClient } from "../../src/claude.ts";
import { extractEvents } from "../../src/extract.ts";

// Real extraction against the Anthropic API. NOT part of `deno task test`. Run
// with `deno task test:live` and ANTHROPIC_API_KEY set; skipped without it.
const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
const model = Deno.env.get("CLAUDE_MODEL") ?? "claude-opus-4-8";

Deno.test({
  name: "live: extract 'coffee and my magnesium at 10am' into multiple events",
  ignore: !apiKey,
  async fn() {
    const claude = new AnthropicClaudeClient(apiKey!, model);
    const now = new Date("2026-06-12T12:00:00Z");
    const candidates = await extractEvents(claude, {
      transcript: "I had a coffee and took my magnesium at 10am",
      now,
    });

    assert(candidates.length >= 2, `expected >= 2 candidates, got ${candidates.length}`);
    const categories = candidates.map((c) => c.category);
    assert(
      categories.includes("drink") && categories.includes("supplement"),
      `expected drink + supplement, got ${categories.join(", ")}`,
    );
  },
});

if (!apiKey) {
  console.info("[capture_live_test] ANTHROPIC_API_KEY not set — skipping live extraction test.");
}
