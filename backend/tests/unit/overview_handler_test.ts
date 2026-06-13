import { assertEquals } from "@std/assert";
import type { Sql } from "npm:postgres@^3.4.4";
import { makeOverviewHandler } from "../../functions/overview/index.ts";

const noSql = new Proxy({}, {
  get() {
    throw new Error("database must not be touched in this path");
  },
}) as unknown as Sql;

Deno.test("overview handler: rejects non-GET with 405", async () => {
  const res = await makeOverviewHandler({ sql: noSql, token: null })(
    new Request("http://x/overview", { method: "POST" }),
  );
  assertEquals(res.status, 405);
});

Deno.test("overview handler: 401 on wrong token", async () => {
  const res = await makeOverviewHandler({ sql: noSql, token: "secret" })(
    new Request("http://x/overview", { headers: { "x-ingest-token": "no" } }),
  );
  assertEquals(res.status, 401);
});

Deno.test("overview handler: 400 (DB untouched) on a malformed date", async () => {
  const res = await makeOverviewHandler({ sql: noSql, token: null })(
    new Request("http://x/overview?date=not-a-date"),
  );
  assertEquals(res.status, 400);
});
