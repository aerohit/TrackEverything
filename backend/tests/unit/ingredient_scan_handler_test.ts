import { assertEquals } from "@std/assert";
import { MockClaudeClient } from "../../src/claude.ts";
import { makeIngredientScanHandler } from "../../functions/ingredient_scan/index.ts";

// Golden vision fixture: the JSON the model returns for a label photo.
const visionReply = {
  ingredients: [
    { name: "Magnesium Glycinate", amount: 200, unit: "mg" },
    { name: "L-Theanine", amount: 100, unit: "mg" },
  ],
};

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/ingredient-scan", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

Deno.test("ingredient-scan: rejects non-POST with 405", async () => {
  const h = makeIngredientScanHandler({ claude: new MockClaudeClient(), token: null });
  assertEquals((await h(new Request("http://localhost/ingredient-scan"))).status, 405);
});

Deno.test("ingredient-scan: 401 on wrong token", async () => {
  const h = makeIngredientScanHandler({ claude: new MockClaudeClient(), token: "secret" });
  assertEquals(
    (await h(post(JSON.stringify({ image: "abc" }), { "x-ingest-token": "no" }))).status,
    401,
  );
});

Deno.test("ingredient-scan: 400 when image is missing", async () => {
  const h = makeIngredientScanHandler({ claude: new MockClaudeClient(), token: null });
  assertEquals((await h(post(JSON.stringify({})))).status, 400);
});

Deno.test("ingredient-scan: 400 on unsupported mediaType", async () => {
  const h = makeIngredientScanHandler({ claude: new MockClaudeClient(), token: null });
  assertEquals(
    (await h(post(JSON.stringify({ image: "abc", mediaType: "image/tiff" })))).status,
    400,
  );
});

Deno.test("ingredient-scan: returns parsed ingredient candidates", async () => {
  const h = makeIngredientScanHandler({
    claude: new MockClaudeClient(undefined, visionReply),
    token: null,
  });
  const res = await h(post(JSON.stringify({ image: "base64data", mediaType: "image/jpeg" })));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ingredients.length, 2);
  assertEquals(body.ingredients[0].name, "Magnesium Glycinate");
});
