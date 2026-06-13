import { assert, assertEquals } from "@std/assert";
import { connect } from "../../src/db.ts";
import { applyMigrations } from "../../src/migrate.ts";
import { insertEvent } from "../../src/events.ts";
import { MockClaudeClient } from "../../src/claude.ts";
import { makeAskHandler } from "../../functions/ask/index.ts";

// Real DB fetch + assembler + citation resolution, with Claude mocked. Tests run
// sequentially and clean up, so the only in-window events are the ones we insert.
const databaseUrl = Deno.env.get("DATABASE_URL");
const now = new Date();

Deno.test({
  name: "POST /ask: fetches recent events, asks, and resolves citations to real rows",
  ignore: !databaseUrl,
  async fn() {
    const sql = await connect(databaseUrl!);
    try {
      await applyMigrations(sql);
      await sql`delete from events`; // isolate this test's window

      const sleep = await insertEvent(sql, {
        category: "sleep",
        occurredAt: new Date(now.getTime() - 6 * 3600_000),
        source: "manual",
        fields: { duration_min: 340 },
      });
      const coffee = await insertEvent(sql, {
        category: "drink",
        occurredAt: new Date(now.getTime() - 2 * 3600_000),
        source: "manual",
        fields: { item: "coffee", caffeine_mg: 200 },
      });

      const claude = new MockClaudeClient(undefined, {
        answer: "Short sleep and late caffeine.",
        citations: ["E1", "E2"],
      });
      const handler = makeAskHandler({ sql, claude, token: null, now: () => now });

      const res = await handler(
        new Request("http://localhost/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: "whats_dragging_me_down" }),
        }),
      );

      assertEquals(res.status, 200);
      const result = await res.json();
      assert(result.answer.length > 0);
      // E1 = oldest (sleep), E2 = coffee.
      assertEquals(result.citedEvents.map((c: { id: string }) => c.id), [sleep.id, coffee.id]);
      assertEquals(result.windowHours, 48);

      await sql`delete from events where id = any(${[sleep.id, coffee.id]})`;
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "POST /ask: a parameterized question ('why do I feel X') runs through the DB path",
  ignore: !databaseUrl,
  async fn() {
    const sql = await connect(databaseUrl!);
    try {
      await applyMigrations(sql);
      await sql`delete from events`;
      const e = await insertEvent(sql, {
        category: "drink",
        occurredAt: new Date(now.getTime() - 1 * 3600_000),
        source: "manual",
        fields: { item: "coffee", caffeine_mg: 200 },
      });

      const claude = new MockClaudeClient(undefined, {
        answer: "Late strong caffeine could explain the jitters.",
        citations: ["E1"],
      });
      const handler = makeAskHandler({ sql, claude, token: null, now: () => now });

      const res = await handler(
        new Request("http://localhost/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: "why_do_i_feel", param: "anxious" }),
        }),
      );

      assertEquals(res.status, 200);
      const result = await res.json();
      assert(result.answer.length > 0);
      assertEquals(result.citedEvents.map((c: { id: string }) => c.id), [e.id]);

      await sql`delete from events where id = ${e.id}`;
    } finally {
      await sql.end();
    }
  },
});
