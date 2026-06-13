import { assertEquals } from "@std/assert";
import type { Sql } from "npm:postgres@^3.4.4";
import { MockClaudeClient } from "../../src/claude.ts";
import { makeAskHandler } from "../../functions/ask/index.ts";

const noSql = new Proxy({}, {
  get() {
    throw new Error("database must not be touched in this path");
  },
}) as unknown as Sql;

const deps = { sql: noSql, claude: new MockClaudeClient(), token: null as string | null };

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/ask", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

Deno.test("ask handler: rejects non-POST with 405", async () => {
  const res = await makeAskHandler(deps)(new Request("http://localhost/ask"));
  assertEquals(res.status, 405);
});

Deno.test("ask handler: 401 on wrong token", async () => {
  const res = await makeAskHandler({ ...deps, token: "secret" })(
    post(JSON.stringify({ question: "whats_dragging_me_down" }), { "x-ingest-token": "no" }),
  );
  assertEquals(res.status, 401);
});

Deno.test("ask handler: 400 on invalid JSON", async () => {
  assertEquals((await makeAskHandler(deps)(post("{nope"))).status, 400);
});

Deno.test("ask handler: 400 (DB untouched) on an unknown question", async () => {
  const res = await makeAskHandler(deps)(
    post(JSON.stringify({ question: "what_lottery_numbers" })),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(Array.isArray(body.available), true);
});
