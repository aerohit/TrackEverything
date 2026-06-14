import { assertEquals } from "@std/assert";
import { MockClaudeClient } from "../../src/claude.ts";
import { makeFoodScanHandler } from "../../functions/food_scan/index.ts";

function req(body: string, headers: Record<string, string> = {}) {
  return new Request("http://x/food-scan", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

Deno.test("food-scan: 405 on non-POST", async () => {
  const res = await makeFoodScanHandler({ claude: new MockClaudeClient(), token: null })(
    new Request("http://x/food-scan", { method: "GET" }),
  );
  assertEquals(res.status, 405);
});

Deno.test("food-scan: 401 on wrong token", async () => {
  const res = await makeFoodScanHandler({ claude: new MockClaudeClient(), token: "secret" })(
    req(JSON.stringify({ image: "x" }), { "x-ingest-token": "no" }),
  );
  assertEquals(res.status, 401);
});

Deno.test("food-scan: 400 without an image", async () => {
  const res = await makeFoodScanHandler({ claude: new MockClaudeClient(), token: null })(
    req(JSON.stringify({ mediaType: "image/png" })),
  );
  assertEquals(res.status, 400);
});

Deno.test("food-scan: 400 on an unsupported media type", async () => {
  const res = await makeFoodScanHandler({ claude: new MockClaudeClient(), token: null })(
    req(JSON.stringify({ image: "x", mediaType: "image/heic" })),
  );
  assertEquals(res.status, 400);
});

Deno.test("food-scan: 200 returns parsed foods", async () => {
  const claude = new MockClaudeClient(undefined, {
    foods: [{
      item: "toast",
      unit: "count",
      amount: 1,
      calories: 80,
      protein_g: 3,
      carbs_g: 14,
      fat_g: 1,
    }],
  });
  const res = await makeFoodScanHandler({ claude, token: null })(
    req(JSON.stringify({ image: "x" })),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.foods[0].item, "toast");
});
