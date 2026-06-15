/**
 * The Hono API for v2 (ADR-015). Routes live under /api; the SvelteKit PWA is
 * served as static assets by server/main.ts. The app factory takes the Drizzle
 * `db` (so tests inject an ephemeral one) and an optional bearer token to guard
 * writes for this single-user tool.
 */
import { Hono } from "hono";
import { z } from "zod";
import { createCheckinSchema, updateCheckinSchema } from "../shared/subjective_state.ts";
import type { Db } from "../db/client.ts";
import {
  createCheckin,
  listCheckins,
  type ListRange,
  softDeleteCheckin,
  toCheckin,
  updateCheckin,
} from "../db/checkins.ts";

export interface AppOptions {
  /** When set, every /api request must present this as a Bearer / x-ingest-token. */
  token?: string;
}

const uuid = z.string().uuid();

export function createApp(db: Db, opts: AppOptions = {}): Hono {
  const app = new Hono();
  const api = new Hono();

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

  api.get("/health", (c) => c.json({ ok: true }));

  // Create a check-in (snapshot of any subset of mood/energy/focus).
  api.post("/checkins", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createCheckinSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues }, 400);
    const row = await createCheckin(db, parsed.data);
    return c.json(toCheckin(row), 201);
  });

  // List live check-ins, newest first; optional [from, to) window + limit.
  api.get("/checkins", async (c) => {
    const range: ListRange = {};
    const { from, to, limit } = c.req.query();
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
    const rows = await listCheckins(db, range);
    return c.json({ checkins: rows.map(toCheckin) });
  });

  // Edit a check-in.
  api.patch("/checkins/:id", async (c) => {
    if (!uuid.safeParse(c.req.param("id")).success) return c.json({ error: "not found" }, 404);
    const body = await c.req.json().catch(() => null);
    const parsed = updateCheckinSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues }, 400);
    const row = await updateCheckin(db, c.req.param("id"), parsed.data);
    return row ? c.json(toCheckin(row)) : c.json({ error: "not found" }, 404);
  });

  // Soft-delete a check-in.
  api.delete("/checkins/:id", async (c) => {
    if (!uuid.safeParse(c.req.param("id")).success) return c.json({ error: "not found" }, 404);
    const deleted = await softDeleteCheckin(db, c.req.param("id"));
    return deleted ? c.body(null, 204) : c.json({ error: "not found" }, 404);
  });

  app.route("/api", api);
  return app;
}
