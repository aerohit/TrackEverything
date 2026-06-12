import { assertEquals } from "@std/assert";
import type { Sql } from "npm:postgres@^3.4.4";
import { makeEventsHandler } from "../../functions/events/index.ts";

// These paths return before touching the database, so a sql that throws on use
// doubles as a guard that we never reach it.
const noSql = new Proxy({}, {
  get() {
    throw new Error("database must not be touched in this path");
  },
}) as unknown as Sql;

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/events", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

const validBody = JSON.stringify({
  category: "drink",
  occurredAt: "2026-06-12T10:00:00Z",
  source: "manual",
});

Deno.test("events handler: rejects non-POST with 405", async () => {
  const res = await makeEventsHandler({ sql: noSql, token: null })(
    new Request("http://localhost/events", { method: "GET" }),
  );
  assertEquals(res.status, 405);
});

Deno.test("events handler: 401 when the token is wrong", async () => {
  const res = await makeEventsHandler({ sql: noSql, token: "secret" })(
    post(validBody, { "x-ingest-token": "nope" }),
  );
  assertEquals(res.status, 401);
});

Deno.test("events handler: 400 on invalid JSON", async () => {
  const res = await makeEventsHandler({ sql: noSql, token: null })(post("{not json"));
  assertEquals(res.status, 400);
});

Deno.test("events handler: 400 with details on an invalid event", async () => {
  const res = await makeEventsHandler({ sql: noSql, token: null })(
    post(JSON.stringify({ category: "telepathy", occurredAt: "nope", source: "manual" })),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(Array.isArray(body.details), true);
});
