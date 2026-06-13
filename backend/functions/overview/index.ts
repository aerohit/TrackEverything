/**
 * Phase 9: `GET /overview?date=YYYY-MM-DD` — a daily summary of what you logged
 * (R-VIEW-1). Fetches the day's events (UTC day boundaries), pulls ingredient
 * lists for any logged products, and aggregates (R-PAT-2). Defaults to today.
 */
import type { Sql } from "npm:postgres@^3.4.4";
import { connect } from "../../src/db.ts";
import { loadConfig } from "../../src/config.ts";
import { getEventsBetween } from "../../src/events.ts";
import { getIngredientsForItems, type IngredientRow } from "../../src/products.ts";
import { aggregateDay } from "../../src/aggregate.ts";

export interface OverviewHandlerDeps {
  sql: Sql;
  token: string | null;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}

export function makeOverviewHandler(deps: OverviewHandlerDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "GET") return jsonResponse(405, { error: "method not allowed" });
    if (deps.token) {
      const provided = bearerToken(req) ?? req.headers.get("x-ingest-token");
      if (provided !== deps.token) return jsonResponse(401, { error: "unauthorized" });
    }

    const today = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
    const date = new URL(req.url).searchParams.get("date") ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonResponse(400, { error: "date must be YYYY-MM-DD" });
    }
    const from = new Date(date + "T00:00:00.000Z");
    if (Number.isNaN(from.getTime())) {
      return jsonResponse(400, { error: "invalid date" });
    }
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

    const events = await getEventsBetween(deps.sql, from, to);
    const itemIds = [...new Set(events.map((e) => e.item_id).filter((x): x is string => !!x))];
    const ingRows = await getIngredientsForItems(deps.sql, itemIds);
    const byItem = new Map<string, IngredientRow[]>();
    for (const r of ingRows) {
      const arr = byItem.get(r.item_id);
      if (arr) arr.push(r);
      else byItem.set(r.item_id, [r]);
    }

    return jsonResponse(200, aggregateDay(date, events, byItem));
  };
}

function bearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length);
  return null;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

if (import.meta.main) {
  const cfg = loadConfig();
  if (!cfg.databaseUrl) {
    console.error("DATABASE_URL is not set — cannot start the overview server.");
    Deno.exit(1);
  }
  const sql = await connect(cfg.databaseUrl);
  Deno.serve(makeOverviewHandler({ sql, token: cfg.ingestToken }));
}
