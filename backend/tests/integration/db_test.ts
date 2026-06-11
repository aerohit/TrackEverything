import { assert } from "@std/assert";
import { pingDatabase } from "../../src/db.ts";

// Reaches a real Postgres. Runs only when DATABASE_URL is set (it is in CI, via
// a Postgres service container); skipped otherwise so the suite still passes on
// a fresh local machine with no database (R-TEST-2).
const databaseUrl = Deno.env.get("DATABASE_URL");

Deno.test({
  name: "database is reachable (select 1)",
  ignore: !databaseUrl,
  async fn() {
    const ok = await pingDatabase(databaseUrl!);
    assert(ok, "expected `select 1` to return ok=1");
  },
});

if (!databaseUrl) {
  console.info(
    "[db_test] DATABASE_URL not set — skipping the live DB connectivity test.",
  );
}
