/**
 * Hono routes for the Inputs domain (v2-2b) — over the db/inputs repository.
 * Mounted under /api by createApp (behind the same bearer-token guard).
 *
 *   GET  /substances                       the analytical vocabulary
 *   POST /items/scan                       label photo → draft item (ADR-019)
 *   POST /intake/recognize                 photo/phrase → recognized intake + matches (ADR-020)
 *   GET  /items ?search&limit              reusable items (summaries)
 *   GET  /items/:id                        one item + its components
 *   POST /items                            create a product / recipe / stack item
 *   POST /intake                           log an intake (resolves + snapshots)
 *   GET  /intake/recent-items ?limit       recent distinct items for quick re-log (ADR-020)
 *   GET  /intake ?from&to&limit            live intake events (with resolution)
 *   GET  /intake/totals ?from&to           daily per-substance totals
 *   PATCH/DELETE /intake/:id               edit / soft-delete (mutable, ADR-018)
 */
import type { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import {
  barcodeLookupRequestSchema,
  createIntakeEventSchema,
  createItemSchema,
  recognizeRequestSchema,
  scanRequestSchema,
  setQuickLogSchema,
  updateIntakeEventSchema,
} from "../shared/inputs.ts";
import type { Db } from "../db/client.ts";
import type { ItemScanner } from "./scan.ts";
import type { ProductLookup } from "./barcode.ts";
import type { IntakeRecognizer } from "./recognize.ts";
import {
  createIntakeEvent,
  createItem,
  dailyTotals,
  favoriteSuggestions,
  getIntakeEvent,
  getItemDetail,
  listIntakeEvents,
  listItems,
  listQuickItems,
  listSubstances,
  recentItems,
  setItemQuickLog,
  softDeleteIntakeEvent,
  softDeleteItem,
  updateIntakeEvent,
} from "../db/inputs.ts";

/** Optional AI seams; each route 503s when its dependency is unconfigured. */
export interface InputDeps {
  scanner?: ItemScanner;
  recognizer?: IntakeRecognizer;
  lookup?: ProductLookup;
}

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

export function registerInputRoutes(api: Hono, db: Db, deps: InputDeps = {}) {
  const { scanner, recognizer, lookup } = deps;

  api.get("/substances", async (c) => c.json({ substances: await listSubstances(db) }));

  // Look up a product barcode → a draft item (not saved; the client edits then POSTs
  // /items). Open Food Facts backs this and needs no key, so it's normally always on.
  api.post("/items/barcode", async (c) => {
    if (!lookup) return c.json({ error: "barcode lookup is not configured" }, 503);
    const parsed = barcodeLookupRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues }, 400);
    try {
      const draft = await lookup.lookup(parsed.data.barcode);
      if (!draft) return c.json({ error: "product not found" }, 404);
      return c.json(draft);
    } catch (e) {
      return c.json({ error: "barcode lookup failed", detail: (e as Error).message }, 502);
    }
  });

  // Scan a label photo → a draft item (not saved; the client edits then POSTs /items).
  api.post("/items/scan", async (c) => {
    if (!scanner) return c.json({ error: "label scanning is not configured" }, 503);
    const parsed = scanRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues }, 400);
    try {
      return c.json(await scanner.scan(parsed.data));
    } catch (e) {
      return c.json({ error: "scan failed", detail: (e as Error).message }, 502);
    }
  });

  // Recognize an intake from a meal photo or a phrase, and match it against the catalog.
  // (Voice is transcribed on-device via the Web Speech API and arrives here as text.)
  api.post("/intake/recognize", async (c) => {
    if (!recognizer) return c.json({ error: "intake recognition is not configured" }, 503);
    const parsed = recognizeRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues }, 400);
    try {
      const recognized = await recognizer.recognize(
        parsed.data.source === "photo"
          ? {
            kind: "photo",
            imageBase64: parsed.data.imageBase64,
            mediaType: parsed.data.mediaType,
            now: parsed.data.now,
          }
          : { kind: "text", text: parsed.data.text, now: parsed.data.now },
      );
      const matches = recognized.name
        ? await listItems(db, { search: recognized.name, limit: 5 })
        : [];
      return c.json({ recognized, matches });
    } catch (e) {
      return c.json({ error: "recognition failed", detail: (e as Error).message }, 502);
    }
  });

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

  // Soft-delete an item (it leaves the catalog/Quick Capture/search; past logs that
  // referenced it keep their frozen snapshot, so the timeline/totals are unchanged).
  api.delete("/items/:id", async (c) => {
    if (!uuid.safeParse(c.req.param("id")).success) return c.json({ error: "not found" }, 404);
    const ok = await softDeleteItem(db, c.req.param("id"));
    return ok ? c.body(null, 204) : c.json({ error: "not found" }, 404);
  });

  // Pin/unpin an item as a Quick Capture favorite (+ ordering + amount presets).
  api.patch("/items/:id/quick-log", async (c) => {
    if (!uuid.safeParse(c.req.param("id")).success) return c.json({ error: "not found" }, 404);
    const parsed = setQuickLogSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues }, 400);
    const ok = await setItemQuickLog(db, c.req.param("id"), parsed.data);
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.json(await getItemDetail(db, c.req.param("id")));
  });

  // The pinned Quick Capture favorites (ordered), each with its amount presets.
  api.get("/intake/quick-items", async (c) => c.json({ items: await listQuickItems(db) }));

  // Items logged often but not yet pinned — "you log this a lot, pin it?" (v2-C0).
  api.get("/intake/favorite-suggestions", async (c) => {
    return c.json({ items: await favoriteSuggestions(db) });
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

  // Top-N distinct recently-logged items, for one-tap re-logging on the Log screen.
  api.get("/intake/recent-items", async (c) => {
    const limitRaw = c.req.query("limit");
    let limit: number | undefined;
    if (limitRaw) {
      limit = Number(limitRaw);
      if (!Number.isInteger(limit) || limit < 1) return c.json({ error: "invalid limit" }, 400);
    }
    return c.json({ items: await recentItems(db, limit ?? 10) });
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
