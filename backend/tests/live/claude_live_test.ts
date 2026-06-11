import { assert } from "@std/assert";
import { AnthropicClaudeClient } from "../../src/claude.ts";

// Hits the real Anthropic API. NOT part of `deno task test` (which must stay
// deterministic and offline). Run on demand with `deno task test:live`, with
// ANTHROPIC_API_KEY set. Skipped automatically when the key is absent.
const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
const model = Deno.env.get("CLAUDE_MODEL") ?? "claude-opus-4-8";

Deno.test({
  name: "live: Claude returns a non-empty hello",
  ignore: !apiKey,
  async fn() {
    const client = new AnthropicClaudeClient(apiKey!, model);
    const reply = await client.hello("Reply with a short, friendly hello.");
    assert(reply.trim().length > 0, "expected a non-empty reply from Claude");
  },
});

if (!apiKey) {
  console.info(
    "[claude_live_test] ANTHROPIC_API_KEY not set — skipping the live Claude test.",
  );
}
