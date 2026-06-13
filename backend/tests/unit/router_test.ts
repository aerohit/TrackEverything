import { assertEquals } from "@std/assert";
import type { Sql } from "npm:postgres@^3.4.4";
import { MockClaudeClient } from "../../src/claude.ts";
import { buildRouter } from "../../main.ts";

const noSql = new Proxy({}, {
  get() {
    throw new Error("database must not be touched in these routing tests");
  },
}) as unknown as Sql;

Deno.test("router: /health returns JSON ok", async () => {
  const router = buildRouter({ sql: noSql, claude: new MockClaudeClient(), token: null });
  const res = await router(new Request("http://x/health"));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).ok, true);
});

Deno.test("router: serves the web UI at / and /app", async () => {
  const router = buildRouter({ sql: noSql, claude: new MockClaudeClient(), token: null });
  for (const path of ["/", "/app"]) {
    const res = await router(new Request("http://x" + path));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "text/html; charset=utf-8");
    const body = await res.text();
    assertEquals(body.includes("TrackEverything"), true);
  }
});

Deno.test("router: unknown route -> 404", async () => {
  const router = buildRouter({ sql: noSql, claude: new MockClaudeClient(), token: null });
  const res = await router(new Request("http://x/nope", { method: "POST" }));
  assertEquals(res.status, 404);
});

Deno.test("router: dispatches to a handler (PUT /events -> 405, no DB touched)", async () => {
  const router = buildRouter({ sql: noSql, claude: new MockClaudeClient(), token: null });
  assertEquals((await router(new Request("http://x/events", { method: "PUT" }))).status, 405);
});

Deno.test("router: claude routes return 503 when no key is configured", async () => {
  const router = buildRouter({ sql: noSql, claude: null, token: null });
  const res = await router(new Request("http://x/ask", { method: "POST" }));
  assertEquals(res.status, 503);
});
