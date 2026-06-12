import { assertEquals } from "@std/assert";
import { MockClaudeClient } from "../../src/claude.ts";
import { makeCaptureHandler } from "../../functions/capture/index.ts";

const now = new Date("2026-06-12T12:00:00Z");

const twoEvents = {
  events: [
    { category: "drink", fields: { item: "coffee" }, rawPhrase: "coffee", time: { type: "now" } },
    {
      category: "supplement",
      fields: { item: "magnesium" },
      rawPhrase: "magnesium",
      time: { type: "now" },
    },
  ],
};

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/capture", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

Deno.test("capture handler: rejects non-POST with 405", async () => {
  const h = makeCaptureHandler({ claude: new MockClaudeClient(), token: null });
  const res = await h(new Request("http://localhost/capture"));
  assertEquals(res.status, 405);
});

Deno.test("capture handler: 401 on wrong token", async () => {
  const h = makeCaptureHandler({ claude: new MockClaudeClient(), token: "secret" });
  const res = await h(post(JSON.stringify({ transcript: "coffee" }), { "x-ingest-token": "nope" }));
  assertEquals(res.status, 401);
});

Deno.test("capture handler: 400 when transcript is missing", async () => {
  const h = makeCaptureHandler({ claude: new MockClaudeClient(), token: null });
  const res = await h(post(JSON.stringify({})));
  assertEquals(res.status, 400);
});

Deno.test("capture handler: returns extracted candidates (not saved)", async () => {
  const h = makeCaptureHandler({
    claude: new MockClaudeClient(undefined, twoEvents),
    token: null,
    now: () => now,
  });
  const res = await h(post(JSON.stringify({ transcript: "coffee and magnesium" })));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.candidates.length, 2);
  assertEquals(body.candidates[0].category, "drink");
  assertEquals(body.candidates[0].source, "voice");
});
