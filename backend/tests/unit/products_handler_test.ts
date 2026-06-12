import { assertEquals } from "@std/assert";
import type { Sql } from "npm:postgres@^3.4.4";
import { makeProductsHandler } from "../../functions/products/index.ts";

const noSql = new Proxy({}, {
  get() {
    throw new Error("database must not be touched in this path");
  },
}) as unknown as Sql;

Deno.test("products handler: 405 on unsupported method", async () => {
  const res = await makeProductsHandler({ sql: noSql, token: null })(
    new Request("http://localhost/products", { method: "PUT" }),
  );
  assertEquals(res.status, 405);
});

Deno.test("products handler: 401 on wrong token", async () => {
  const res = await makeProductsHandler({ sql: noSql, token: "secret" })(
    new Request("http://localhost/products", {
      method: "GET",
      headers: { "x-ingest-token": "no" },
    }),
  );
  assertEquals(res.status, 401);
});

Deno.test("products handler: 400 (DB untouched) on an invalid create", async () => {
  const res = await makeProductsHandler({ sql: noSql, token: null })(
    new Request("http://localhost/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "", category: "telepathy", ingredients: [] }),
    }),
  );
  assertEquals(res.status, 400);
  assertEquals(Array.isArray((await res.json()).details), true);
});
