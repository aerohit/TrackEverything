import { assertEquals } from "@std/assert";
import type { Sql } from "npm:postgres@^3.4.4";
import { makeCheckinHandler } from "../../functions/checkin/index.ts";

const noSql = new Proxy({}, {
  get() {
    throw new Error("database must not be touched in this path");
  },
}) as unknown as Sql;

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/checkin", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

Deno.test("checkin handler: rejects non-POST with 405", async () => {
  const res = await makeCheckinHandler({ sql: noSql, token: null })(
    new Request("http://localhost/checkin"),
  );
  assertEquals(res.status, 405);
});

Deno.test("checkin handler: 401 on wrong token", async () => {
  const res = await makeCheckinHandler({ sql: noSql, token: "secret" })(
    post(JSON.stringify({ mood: 4 }), { "x-ingest-token": "no" }),
  );
  assertEquals(res.status, 401);
});

Deno.test("checkin handler: 400 (DB untouched) when no dimension is given", async () => {
  const res = await makeCheckinHandler({ sql: noSql, token: null })(post(JSON.stringify({})));
  assertEquals(res.status, 400);
  assertEquals(Array.isArray((await res.json()).details), true);
});

Deno.test("checkin handler: 400 (DB untouched) on an out-of-range rating", async () => {
  const res = await makeCheckinHandler({ sql: noSql, token: null })(
    post(JSON.stringify({ mood: 9 })),
  );
  assertEquals(res.status, 400);
});
