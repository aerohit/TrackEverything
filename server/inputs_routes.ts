/**
 * Hono routes for the Inputs domain (v2-2b) — over the db/inputs repository.
 * Mounted under /api by createApp (behind the same bearer-token guard).
 *
 *   GET  /substances                       the analytical vocabulary
 *   GET  /items ?search&limit              reusable items (summaries)
 *   GET  /items/:id                        one item + its components
 *   POST /items                            create a product / recipe / simple item
 *   POST /intake                           log an intake (resolves + snapshots)
 *   GET  /intake ?from&to&limit            live intake events (with resolution)
 *   GET  /intake/totals ?from&to           daily per-substance totals
 *   PATCH/DELETE /intake/:id               edit / soft-delete (mutable, ADR-018)
 */
import type { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import {
  createIntakeEventSchema,
  createItemSchema,
  updateIntakeEventSchema,
} from "../shared/inputs.ts";
import type { Db } from "../db/client.ts";
import {
  createIntakeEvent,
  createItem,
  dailyTotals,
  getIntakeEvent,
  getItemDetail,
  listIntakeEvents,
  listItems,
  listSubstances,
  softDeleteIntakeEvent,
  updateIntakeEvent,
} from "../db/inputs.ts";

const uuid = z.string().uuid();

/** Parse ?from&to (ISO) into a Date window, or a 400 message. */
function parseWindow(c: Context): { from?: Date; to?: Date } | { error: string } {
  const out: { from?: Date; to?: Date } = {};
  for (const key of ["from", "to"] as const) {
    const raw = c.req.query(key);
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return { error: `invalid ${key} date` };
    out[key] = d;
  }
  return out;
}

export function registerInputRoutes(api: Hono, db: Db) {
  api.get("/substances", async (c) => c.json({ substances: await listSubstances(db) }));

  api.get("/items", async (c) => {
    const limitRaw = c.req.query("limit");
    let limit: number | undefined;
    if (limitRaw) {
      limit = Number(limitRaw);
      if (!Number.isInteger(limit) || limit < 1) return c.json({ error: "invalid limit" }, 400);
    }
    return c.json({ items: await listItems(db, { search: c.req.query("search"), limit }) });
  });

  api.get("/items/:id", async (c) => {
    if (!uuid.safeParse(c.req.param("id")).success) return c.json({ error: "not found" }, 404);
    const item = await getItemDetail(db, c.req.param("id"));
    return item ? c.json(item) : c.json({ error: "not found" }, 404);
  });

  api.post("/items", async (c) => {
    const parsed = createItemSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues }, 400);
    try {
      const id = await createItem(db, parsed.data);
      return c.json(await getItemDetail(db, id), 201);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  api.post("/intake", async (c) => {
    const parsed = createIntakeEventSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues }, 400);
    try {
      const id = await createIntakeEvent(db, parsed.data);
      return c.json(await getIntakeEvent(db, id), 201);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  api.get("/intake/totals", async (c) => {
    const w = parseWindow(c);
    if ("error" in w) return c.json({ error: w.error }, 400);
    if (!w.from || !w.to) return c.json({ error: "from and to are required" }, 400);
    return c.json({ totals: await dailyTotals(db, w.from, w.to) });
  });

  api.get("/intake", async (c) => {
    const w = parseWindow(c);
    if ("error" in w) return c.json({ error: w.error }, 400);
    const limitRaw = c.req.query("limit");
    let limit: number | undefined;
    if (limitRaw) {
      limit = Number(limitRaw);
      if (!Number.isInteger(limit) || limit < 1) return c.json({ error: "invalid limit" }, 400);
    }
    return c.json({ events: await listIntakeEvents(db, { ...w, limit }) });
  });

  api.patch("/intake/:id", async (c) => {
    if (!uuid.safeParse(c.req.param("id")).success) return c.json({ error: "not found" }, 404);
    const parsed = updateIntakeEventSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues }, 400);
    try {
      const ok = await updateIntakeEvent(db, c.req.param("id"), parsed.data);
      if (!ok) return c.json({ error: "not found" }, 404);
      return c.json(await getIntakeEvent(db, c.req.param("id")));
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  api.delete("/intake/:id", async (c) => {
    if (!uuid.safeParse(c.req.param("id")).success) return c.json({ error: "not found" }, 404);
    const ok = await softDeleteIntakeEvent(db, c.req.param("id"));
    return ok ? c.body(null, 204) : c.json({ error: "not found" }, 404);
  });
}
