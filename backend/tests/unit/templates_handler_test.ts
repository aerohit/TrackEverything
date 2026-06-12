import { assertEquals } from "@std/assert";
import type { Sql } from "npm:postgres@^3.4.4";
import { makeTemplatesHandler } from "../../functions/templates/index.ts";

const noSql = new Proxy({}, {
  get() {
    throw new Error("database must not be touched in this path");
  },
}) as unknown as Sql;

Deno.test("templates handler: 405 on unsupported method", async () => {
  const res = await makeTemplatesHandler({ sql: noSql, token: null })(
    new Request("http://localhost/templates", { method: "DELETE" }),
  );
  assertEquals(res.status, 405);
});

Deno.test("templates handler: 401 on wrong token", async () => {
  const res = await makeTemplatesHandler({ sql: noSql, token: "secret" })(
    new Request("http://localhost/templates", {
      method: "GET",
      headers: { "x-ingest-token": "nope" },
    }),
  );
  assertEquals(res.status, 401);
});

Deno.test("templates handler: 400 (DB untouched) on an invalid create", async () => {
  const res = await makeTemplatesHandler({ sql: noSql, token: null })(
    new Request("http://localhost/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "", category: "telepathy" }),
    }),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(Array.isArray(body.details), true);
});
