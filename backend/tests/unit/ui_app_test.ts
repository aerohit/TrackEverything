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

Deno.test("ui: manual logging, check-in note & quick-log overrides (11b)", () => {
  const js = scriptBody();
  const html = APP_HTML;
  // Manual single-event form.
  assert(html.includes('id="manCat"'), "should have a manual category picker");
  assert(html.includes('id="manSave"'), "should have a manual save button");
  assert(js.includes("initManual"), "should wire the manual logging form");
  assert(js.includes('source: "manual"'), "manual events should be sourced as manual");
  // Check-in note.
  assert(html.includes('id="checkinNote"'), "should have a check-in note field");
  assert(js.includes("body.note = note"), "check-in should send the note");
  // Quick-log servings / fields override.
  assert(
    html.includes('id="quickServings"') && html.includes('id="quickFields"'),
    "quick-log options",
  );
  assert(
    js.includes("quickOptions") && js.includes("parseFields"),
    "quick-log should merge overrides",
  );
});

Deno.test("ui: manage — products, templates, label scan (11c)", () => {
  const js = scriptBody();
  const html = APP_HTML;
  // Label scan -> product.
  assert(html.includes('id="prodImage"') && html.includes('type="file"'), "label photo picker");
  assert(js.includes("/ingredient-scan"), "should call the vision scan endpoint");
  assert(js.includes("fileToBase64"), "should base64-encode the chosen image");
  // Create product / template.
  assert(html.includes('id="prodSave"') && html.includes('id="tplSave"'), "save buttons");
  assert(js.includes('api("/products", "POST"'), "should create a product");
  assert(js.includes('api("/templates", "POST"'), "should create a template");
  // Ingredient-expansion preview.
  assert(html.includes('id="brkLoad"'), "breakdown button");
  assert(js.includes("/products?name="), "should fetch the expanded breakdown");
  // New products/templates show up as quick-log buttons.
  assert(js.includes("loadQuick()"), "saving should refresh quick-log buttons");
});

Deno.test("ui: timeline, cited-event detail, window control & cookie token (11d)", () => {
  const js = scriptBody();
  const html = APP_HTML;
  // Timeline view backed by GET /events.
  assert(html.includes('id="timeline"'), "should have a timeline card");
  assert(js.includes("loadTimeline") && js.includes('api("/events?limit='), "should list events");
  // Ask: a window control + cited-event detail (not just a count).
  assert(html.includes('id="askWindow"'), "should have an Ask window control");
  assert(js.includes("body.windowHours = w"), "Ask should send windowHours");
  assert(js.includes("renderAnswer") && js.includes("e.occurredAt"), "should render cited events");
  // Token stored in a cookie so it survives reloads.
  assert(js.includes("setCookie") && js.includes("getCookie"), "token should use a cookie");
  assert(js.includes("max-age="), "cookie should be persistent");
});

Deno.test("ui: the editable category list matches the backend vocabulary", async () => {
  const { CATEGORIES } = await import("../../src/vocab.ts");
  const js = scriptBody();
  const m = js.match(/var CATEGORIES = \[([^\]]*)\]/);
  assert(m, "embedded script must define a CATEGORIES array");
  const uiCategories = m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
  assertEquals(uiCategories, [...CATEGORIES], "UI category picker must match src/vocab.ts");
});
