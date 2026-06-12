import { assert } from "@std/assert";
import { encodeBase64 } from "jsr:@std/encoding@^1.0.5/base64";
import { AnthropicClaudeClient } from "../../src/claude.ts";
import { extractIngredientsFromImage } from "../../src/products.ts";

// Real vision extraction from a supplement-label photo. Needs both an
// ANTHROPIC_API_KEY and TEST_LABEL_IMAGE (path to a jpeg/png of a label).
// Skipped unless both are set — run via `deno task test:live`.
const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
const imagePath = Deno.env.get("TEST_LABEL_IMAGE");
const model = Deno.env.get("CLAUDE_MODEL") ?? "claude-opus-4-8";

Deno.test({
  name: "live: extract an ingredient list from a real label photo",
  ignore: !apiKey || !imagePath,
  async fn() {
    const bytes = await Deno.readFile(imagePath!);
    const mediaType = imagePath!.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    const claude = new AnthropicClaudeClient(apiKey!, model);
    const ingredients = await extractIngredientsFromImage(claude, {
      imageBase64: encodeBase64(bytes),
      mediaType,
    });
    assert(ingredients.length >= 1, `expected >= 1 ingredient, got ${ingredients.length}`);
    assert(ingredients.every((i) => i.name.length > 0), "every ingredient should have a name");
  },
});

if (!apiKey || !imagePath) {
  console.info(
    "[ingredient_scan_live_test] set ANTHROPIC_API_KEY and TEST_LABEL_IMAGE to run this.",
  );
}
