import { assertEquals } from "@std/assert";
import { MockClaudeClient } from "../../src/claude.ts";
import { connect } from "../../src/db.ts";
import { buildRouter } from "../../main.ts";

// `/health?warm=1` runs a real `select 1` to warm the pooled connection and keep a
// free-tier Supabase project from pausing. Runs when DATABASE_URL is set.
const databaseUrl = Deno.env.get("DATABASE_URL");

Deno.test({
  name: "GET /health?warm=1 pings the database and reports db:true",
  ignore: !databaseUrl,
  async fn() {
    const sql = await connect(databaseUrl!);
    try {
      const router = buildRouter({ sql, claude: new MockClaudeClient(), token: null });
      const res = await router(new Request("http://x/health?warm=1"));
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.ok, true);
      assertEquals(body.db, true);
    } finally {
      await sql.end();
    }
  },
});
