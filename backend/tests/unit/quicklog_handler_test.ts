import { assertEquals } from "@std/assert";
import type { Sql } from "npm:postgres@^3.4.4";
import { makeQuicklogHandler } from "../../functions/quicklog/index.ts";

// These paths return before any DB access; the throwing proxy guards that.
const noSql = new Proxy({}, {
  get() {
    throw new Error("database must not be touched in this path");
  },
}) as unknown as Sql;

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/quicklog", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

Deno.test("quicklog handler: rejects non-POST with 405", async () => {
  const res = await makeQuicklogHandler({ sql: noSql, token: null })(
    new Request("http://localhost/quicklog"),
  );
  assertEquals(res.status, 405);
});

Deno.test("quicklog handler: 401 on wrong token", async () => {
  const res = await makeQuicklogHandler({ sql: noSql, token: "secret" })(
    post(JSON.stringify({ template: "my coffee" }), { "x-ingest-token": "nope" }),
  );
  assertEquals(res.status, 401);
});

Deno.test("quicklog handler: 400 when template name is missing", async () => {
  const res = await makeQuicklogHandler({ sql: noSql, token: null })(post(JSON.stringify({})));
  assertEquals(res.status, 400);
});
