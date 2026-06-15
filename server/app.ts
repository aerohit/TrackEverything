/**
 * The Hono API for v2 (ADR-015). Routes live under /api; the SvelteKit PWA is
 * served as static assets by server/main.ts. The app factory takes the Drizzle
 * `db` (so tests inject an ephemeral one) and an optional bearer token to guard
 * writes for this single-user tool.
 *
 * Subjective State readings are immutable (ADR-017): create + read only — there
 * are no edit or delete routes by design.
 */
import { type Context, Hono } from "hono";
import { sql } from "drizzle-orm";
import { createCheckinSchema, kindSchema } from "../shared/subjective_state.ts";
import type { Db } from "../db/client.ts";
import { createCheckin, listCheckins, type ListRange, toCheckin } from "../db/checkins.ts";
import { type InputDeps, registerInputRoutes } from "./inputs_routes.ts";
import type { ItemScanner } from "./scan.ts";
import type { IntakeRecognizer } from "./recognize.ts";

export interface AppOptions {
  /** When set, every /api request must present this as a Bearer / x-ingest-token. */
  token?: string;
  /** Label-scan backend (Claude vision). When absent, /api/items/scan returns 503. */
  scanner?: ItemScanner;
  /** Meal-photo / phrase recognizer (Claude). When absent, /api/intake/recognize returns 503. */
  recognizer?: IntakeRecognizer;
}

export function createApp(db: Db, opts: AppOptions = {}): Hono {
  const app = new Hono();
  const api = new Hono();

  // Health stays open (the warmup workflow pings it); `?warm=1` also runs a tiny
  // query to keep the pooled DB connection — and the free-tier Supabase project —
  // warm. Registered on both / and /api before the auth guard.
  const health = async (c: Context) => {
    if (c.req.query("warm")) {
      try {
        await db.execute(sql`select 1`);
      } catch { /* keep health green even if the DB is briefly unreachable */ }
    }
    return c.json({ ok: true });
  };
  app.get("/health", health);
  api.get("/health", health);

  if (opts.token) {
    api.use("*", async (c, next) => {
      const header = c.req.header("authorization");
      const presented = header?.startsWith("Bearer ")
        ? header.slice("Bearer ".length)
        : c.req.header("x-ingest-token");
      if (presented !== opts.token) return c.json({ error: "unauthorized" }, 401);
      await next();
    });
  }

  // Record a check-in: one or more immutable readings, sharing a recorded_at.
  api.post("/checkins", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createCheckinSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues }, 400);
    const rows = await createCheckin(db, parsed.data);
    return c.json({ checkins: rows.map(toCheckin) }, 201);
  });

  // List readings, newest first; optional [from, to) window, limit, and kind filter.
  api.get("/checkins", async (c) => {
    const range: ListRange = {};
    const { from, to, limit, kind } = c.req.query();
    for (const [key, raw] of [["from", from], ["to", to]] as const) {
      if (!raw) continue;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return c.json({ error: `invalid ${key} date` }, 400);
      range[key] = d;
    }
    if (limit) {
      const n = Number(limit);
      if (!Number.isInteger(n) || n < 1) return c.json({ error: "invalid limit" }, 400);
      range.limit = n;
    }
    if (kind) {
      const k = kindSchema.safeParse(kind);
      if (!k.success) return c.json({ error: "invalid kind" }, 400);
      range.kind = k.data;
    }
    const rows = await listCheckins(db, range);
    return c.json({ checkins: rows.map(toCheckin) });
  });

  // Inputs domain (v2-2b) routes.
  const deps: InputDeps = {
    scanner: opts.scanner,
    recognizer: opts.recognizer,
  };
  registerInputRoutes(api, db, deps);

  app.route("/api", api);
  return app;
}
