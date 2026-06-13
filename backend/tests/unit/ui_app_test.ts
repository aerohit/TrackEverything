import { assert, assertEquals } from "@std/assert";
import { APP_HTML } from "../../ui/app.ts";

// The UI ships as a template string, so the embedded vanilla JS is never seen by
// the TypeScript checker — a syntax error there would only show up in the browser.
// Extract the <script> body and parse it (parse-only via `new Function`, which never
// executes it, so browser globals like `document` don't need to exist) to guard that.
function scriptBody(): string {
  const m = APP_HTML.match(/<script>([\s\S]*?)<\/script>/);
  assert(m, "APP_HTML must contain a <script> block");
  return m[1];
}

Deno.test("ui: embedded script parses (no syntax errors)", () => {
  // Throws SyntaxError if the embedded JS is malformed; does not run it.
  new Function(scriptBody());
});

Deno.test("ui: capture candidates are editable + backdatable (11a)", () => {
  const js = scriptBody();
  // The editable confirmation card and its time picker (R-CAP-9 + R-CAP-7 in the UI).
  for (const marker of ["candidateCard", "collectEdited", "datetime-local", "toLocalInput"]) {
    assert(js.includes(marker), `embedded script should reference ${marker}`);
  }
  // A touched time is asserted as high-confidence, not left inferred.
  assert(js.includes('"high"'), "edited time should be sent as high confidence");
});

Deno.test("ui: the editable category list matches the backend vocabulary", async () => {
  const { CATEGORIES } = await import("../../src/vocab.ts");
  const js = scriptBody();
  const m = js.match(/var CATEGORIES = \[([^\]]*)\]/);
  assert(m, "embedded script must define a CATEGORIES array");
  const uiCategories = m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
  assertEquals(uiCategories, [...CATEGORIES], "UI category picker must match src/vocab.ts");
});
