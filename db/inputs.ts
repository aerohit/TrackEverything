/**
 * Repository for the Inputs domain (ADR-018). Creates reusable items, logs intake
 * events (running the resolver and freezing a per-event snapshot in resolved_amount),
 * edits/soft-deletes events (mutable), lists events with their resolution, and rolls
 * a day up into per-substance totals.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import type {
  Confidence,
  CreateIntakeEvent,
  CreateItem,
  DailyTotal,
  FavoriteSuggestion,
  InputItemDetail,
  InputItemSummary,
  IntakeEvent,
  QuickItem,
  RecentItem,
  SetQuickLog,
  Substance,
  SubstanceUnit,
  UpdateIntakeEvent,
} from "../shared/inputs.ts";
import { SUBSTANCE_UNITS } from "../shared/inputs.ts";
import type { Db } from "./client.ts";
import {
  inputItem,
  type InputItemRow,
  intakeEvent,
  itemComponent,
  quickPreset,
  resolvedAmount,
  substance,
} from "./schema.ts";
import { convert, type ResolveGraph, type ResolveItem, resolveItem } from "./resolve.ts";

interface SubstanceMeta {
  id: string;
  unit: SubstanceUnit;
}

/** name + each alias (lowercased) → {id, canonical unit}. */
/** Normalize a substance name for matching: lowercase, spaces/hyphens → underscores. */
function normalizeSubstance(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Coerce a free-text unit into a canonical substance unit (defaults to mg). */
function toSubstanceUnit(u: string): SubstanceUnit {
  const n = u.trim().toLowerCase();
  if (n === "µg" || n === "ug") return "mcg";
  return (SUBSTANCE_UNITS as readonly string[]).includes(n) ? n as SubstanceUnit : "mg";
}

/** name + aliases (normalized) → {id, canonical unit}. */
async function substanceIndex(db: Db): Promise<Map<string, SubstanceMeta>> {
  const rows = await db.select().from(substance);
  const m = new Map<string, SubstanceMeta>();
  for (const s of rows) {
    const meta = { id: s.id, unit: s.canonicalUnit };
    m.set(normalizeSubstance(s.name), meta);
    for (const a of s.aliases) m.set(normalizeSubstance(a), meta);
  }
  return m;
}

/** Find a substance by name, auto-creating it (type "other") if unknown — ADR-019. */
async function resolveSubstanceId(
  db: Db,
  index: Map<string, SubstanceMeta>,
  name: string,
  unit: string,
): Promise<string> {
  const key = normalizeSubstance(name);
  let meta = index.get(key);
  if (!meta) {
    const canonicalUnit = toSubstanceUnit(unit);
    let [created] = await db.insert(substance)
      .values({ name: key, substanceType: "other", canonicalUnit })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      [created] = await db.select().from(substance).where(eq(substance.name, key));
    }
    meta = { id: created.id, unit: created.canonicalUnit };
    index.set(key, meta);
  }
  return meta.id;
}

export async function createItem(db: Db, input: CreateItem): Promise<string> {
  const [item] = await db.insert(inputItem).values({
    name: input.name,
    kind: input.kind,
    primaryType: input.primaryType,
    roles: input.roles ?? [],
    brand: input.brand ?? null,
    defaultDisplayQuantity: input.defaultServing?.displayQuantity ?? null,
    defaultDisplayUnit: input.defaultServing?.displayUnit ?? null,
    defaultCanonicalQuantity: input.defaultServing?.canonicalQuantity ?? null,
    defaultCanonicalUnit: input.defaultServing?.canonicalUnit ?? null,
    notes: input.notes ?? null,
  }).returning();

  const components = input.components ?? [];
  if (components.length) {
    const subs = await substanceIndex(db);
    const rows = [];
    for (let i = 0; i < components.length; i++) {
      const c = components[i];
      const substanceId = c.substance
        ? await resolveSubstanceId(db, subs, c.substance, c.unit)
        : null;
      rows.push({
        parentItemId: item.id,
        substanceId,
        childItemId: c.childItemId ?? null,
        amount: c.amount,
        unit: c.unit,
        position: c.position ?? i,
        prepState: c.prepState ?? null,
      });
    }
    await db.insert(itemComponent).values(rows);
  }
  return item.id;
}

/** Load an item + all descendant items + substance units into a resolve graph. */
async function loadGraph(db: Db, rootId: string): Promise<ResolveGraph> {
  const substanceUnit = new Map<string, SubstanceUnit>();
  for (const s of await db.select().from(substance)) substanceUnit.set(s.id, s.canonicalUnit);

  const items: ResolveGraph["items"] = new Map();
  const toLoad = [rootId];
  while (toLoad.length) {
    const id = toLoad.pop() as string;
    if (items.has(id)) continue;
    const [it] = await db.select().from(inputItem).where(eq(inputItem.id, id));
    if (!it) continue;
    const comps = await db.select().from(itemComponent).where(eq(itemComponent.parentItemId, id));
    items.set(id, {
      id: it.id,
      defaultDisplayQuantity: it.defaultDisplayQuantity,
      defaultDisplayUnit: it.defaultDisplayUnit,
      defaultCanonicalQuantity: it.defaultCanonicalQuantity,
      defaultCanonicalUnit: it.defaultCanonicalUnit,
      components: comps.map((c) => ({
        substanceId: c.substanceId,
        childItemId: c.childItemId,
        amount: c.amount,
        unit: c.unit,
      })),
    });
    for (const c of comps) if (c.childItemId) toLoad.push(c.childItemId);
  }
  return { items, substanceUnit };
}

interface ComputedResolution {
  rows: {
    substanceId: string;
    amount: number;
    unit: SubstanceUnit;
    confidence: Confidence;
    source: string;
  }[];
  canonicalQuantity: number | null;
  canonicalUnit: string | null;
}

/** The canonical (analysable) size of a logged quantity, if the item's serving allows. */
function canonicalServing(
  item: ResolveItem,
  quantity: number,
  unit: string,
): { quantity: number; unit: string } | null {
  if (!item.defaultCanonicalUnit || !item.defaultCanonicalQuantity) return null;
  if (item.defaultDisplayUnit && item.defaultDisplayQuantity) {
    const c = convert(quantity, unit, item.defaultDisplayUnit);
    if (c !== null) {
      return {
        quantity: (c / item.defaultDisplayQuantity) * item.defaultCanonicalQuantity,
        unit: item.defaultCanonicalUnit,
      };
    }
  }
  const direct = convert(quantity, unit, item.defaultCanonicalUnit);
  return direct === null ? null : { quantity: direct, unit: item.defaultCanonicalUnit };
}

async function computeResolution(
  db: Db,
  input: {
    itemId?: string;
    quantity: number;
    unit: string;
    confidence?: Confidence;
    resolved?: CreateIntakeEvent["resolved"];
  },
): Promise<ComputedResolution> {
  const baseConfidence = input.confidence ?? "medium";
  if (input.itemId) {
    const graph = await loadGraph(db, input.itemId);
    const { amounts, complete } = resolveItem(input.itemId, input.quantity, input.unit, graph);
    const item = graph.items.get(input.itemId);
    const canonical = item ? canonicalServing(item, input.quantity, input.unit) : null;
    const confidence: Confidence = complete ? baseConfidence : "low";
    return {
      rows: amounts.map((a) => ({ ...a, confidence, source: "item" })),
      canonicalQuantity: canonical?.quantity ?? null,
      canonicalUnit: canonical?.unit ?? null,
    };
  }
  if (input.resolved?.length) {
    const subs = await substanceIndex(db);
    const rows = [];
    for (const r of input.resolved) {
      const substanceId = await resolveSubstanceId(db, subs, r.substance, r.unit);
      const meta = subs.get(normalizeSubstance(r.substance)) as SubstanceMeta;
      const amt = convert(r.amount, r.unit, meta.unit) ?? r.amount;
      rows.push({
        substanceId,
        amount: Math.round(amt * 1000) / 1000,
        unit: meta.unit,
        confidence: r.confidence ?? baseConfidence,
        source: "manual",
      });
    }
    return { rows, canonicalQuantity: null, canonicalUnit: null };
  }
  return { rows: [], canonicalQuantity: null, canonicalUnit: null };
}

export async function createIntakeEvent(db: Db, input: CreateIntakeEvent): Promise<string> {
  let itemVersion: number | null = null;
  if (input.itemId) {
    const [it] = await db.select({ version: inputItem.version }).from(inputItem).where(
      eq(inputItem.id, input.itemId),
    );
    itemVersion = it?.version ?? null;
  }
  const resolution = await computeResolution(db, input);
  const [ev] = await db.insert(intakeEvent).values({
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
    displayName: input.displayName,
    itemId: input.itemId ?? null,
    itemVersion,
    quantity: input.quantity,
    unit: input.unit,
    canonicalQuantity: resolution.canonicalQuantity,
    canonicalUnit: resolution.canonicalUnit,
    confidence: input.confidence ?? "medium",
    contextTags: input.contextTags ?? [],
    notes: input.notes ?? null,
    source: input.source ?? "manual",
  }).returning();
  if (resolution.rows.length) {
    await db.insert(resolvedAmount).values(resolution.rows.map((r) => ({ eventId: ev.id, ...r })));
  }
  return ev.id;
}

/** Patch a live event and re-resolve its snapshot from the new values. */
export async function updateIntakeEvent(
  db: Db,
  id: string,
  patch: UpdateIntakeEvent,
): Promise<boolean> {
  const [current] = await db.select().from(intakeEvent).where(
    and(eq(intakeEvent.id, id), isNull(intakeEvent.deletedAt)),
  );
  if (!current) return false;

  const merged = {
    itemId: patch.itemId !== undefined ? patch.itemId : (current.itemId ?? undefined),
    quantity: patch.quantity ?? current.quantity,
    unit: patch.unit ?? current.unit,
    confidence: patch.confidence ?? current.confidence,
    resolved: patch.resolved,
  };
  const resolution = await computeResolution(db, merged);

  await db.update(intakeEvent).set({
    occurredAt: patch.occurredAt ? new Date(patch.occurredAt) : current.occurredAt,
    displayName: patch.displayName ?? current.displayName,
    itemId: merged.itemId ?? null,
    quantity: merged.quantity,
    unit: merged.unit,
    canonicalQuantity: resolution.canonicalQuantity,
    canonicalUnit: resolution.canonicalUnit,
    confidence: merged.confidence,
    contextTags: patch.contextTags ?? current.contextTags,
    notes: patch.notes !== undefined ? patch.notes : current.notes,
    updatedAt: new Date(),
  }).where(eq(intakeEvent.id, id));

  await db.delete(resolvedAmount).where(eq(resolvedAmount.eventId, id));
  if (resolution.rows.length) {
    await db.insert(resolvedAmount).values(resolution.rows.map((r) => ({ eventId: id, ...r })));
  }
  return true;
}

export async function softDeleteIntakeEvent(db: Db, id: string): Promise<boolean> {
  const rows = await db.update(intakeEvent)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(intakeEvent.id, id), isNull(intakeEvent.deletedAt)))
    .returning({ id: intakeEvent.id });
  return rows.length > 0;
}

export interface ListRange {
  from?: Date;
  to?: Date;
  limit?: number;
}

/** Live intake events, newest first, each with its resolved substance amounts. */
export async function listIntakeEvents(db: Db, range: ListRange = {}): Promise<IntakeEvent[]> {
  const conds = [isNull(intakeEvent.deletedAt)];
  if (range.from) conds.push(gte(intakeEvent.occurredAt, range.from));
  if (range.to) conds.push(lt(intakeEvent.occurredAt, range.to));
  const limit = Math.min(Math.max(range.limit ?? 200, 1), 500);

  const events = await db.select().from(intakeEvent)
    .where(and(...conds))
    .orderBy(desc(intakeEvent.occurredAt))
    .limit(limit);
  if (!events.length) return [];

  const resolved = await db.select({
    eventId: resolvedAmount.eventId,
    substance: substance.name,
    amount: resolvedAmount.amount,
    unit: resolvedAmount.unit,
    confidence: resolvedAmount.confidence,
    source: resolvedAmount.source,
  })
    .from(resolvedAmount)
    .innerJoin(substance, eq(resolvedAmount.substanceId, substance.id))
    .where(inArray(resolvedAmount.eventId, events.map((e) => e.id)));

  const byEvent = new Map<string, IntakeEvent["resolved"]>();
  for (const r of resolved) {
    const list = byEvent.get(r.eventId) ?? [];
    list.push({
      substance: r.substance,
      amount: r.amount,
      unit: r.unit,
      confidence: r.confidence,
      source: r.source,
    });
    byEvent.set(r.eventId, list);
  }

  return events.map((e) => eventDto(e, byEvent.get(e.id) ?? []));
}

/**
 * The most recently logged distinct items (by itemId, or by display name for freeform
 * logs), newest first, carrying the quantity/unit of their last log — for one-tap
 * re-logging on the Log screen.
 */
export async function recentItems(db: Db, limit = 10): Promise<RecentItem[]> {
  const lim = Math.min(Math.max(limit, 1), 50);
  const rows = await db.select({
    itemId: intakeEvent.itemId,
    displayName: intakeEvent.displayName,
    quantity: intakeEvent.quantity,
    unit: intakeEvent.unit,
    occurredAt: intakeEvent.occurredAt,
  }).from(intakeEvent)
    .where(isNull(intakeEvent.deletedAt))
    .orderBy(desc(intakeEvent.occurredAt))
    .limit(500);

  const seen = new Set<string>();
  const out: RecentItem[] = [];
  for (const r of rows) {
    const key = r.itemId ?? `name:${r.displayName.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      itemId: r.itemId,
      displayName: r.displayName,
      quantity: r.quantity,
      unit: r.unit,
      lastLoggedAt: r.occurredAt.toISOString(),
    });
    if (out.length >= lim) break;
  }
  return out;
}

function eventDto(
  e: typeof intakeEvent.$inferSelect,
  resolved: IntakeEvent["resolved"],
): IntakeEvent {
  return {
    id: e.id,
    occurredAt: e.occurredAt.toISOString(),
    displayName: e.displayName,
    itemId: e.itemId,
    quantity: e.quantity,
    unit: e.unit,
    canonicalQuantity: e.canonicalQuantity,
    canonicalUnit: e.canonicalUnit,
    confidence: e.confidence,
    contextTags: e.contextTags,
    notes: e.notes,
    source: e.source,
    resolved,
  };
}

/** A single live intake event with its resolution, or null. */
export async function getIntakeEvent(db: Db, id: string): Promise<IntakeEvent | null> {
  const [e] = await db.select().from(intakeEvent).where(
    and(eq(intakeEvent.id, id), isNull(intakeEvent.deletedAt)),
  );
  if (!e) return null;
  const resolved = await db.select({
    substance: substance.name,
    amount: resolvedAmount.amount,
    unit: resolvedAmount.unit,
    confidence: resolvedAmount.confidence,
    source: resolvedAmount.source,
  })
    .from(resolvedAmount)
    .innerJoin(substance, eq(resolvedAmount.substanceId, substance.id))
    .where(eq(resolvedAmount.eventId, id));
  return eventDto(e, resolved);
}

// ---- reference reads (for the UI: pick substances / items) ----

export async function listSubstances(db: Db): Promise<Substance[]> {
  const rows = await db.select().from(substance).orderBy(asc(substance.name));
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    substanceType: s.substanceType,
    canonicalUnit: s.canonicalUnit,
    aliases: s.aliases,
  }));
}

function itemSummary(r: InputItemRow): InputItemSummary {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    primaryType: r.primaryType,
    roles: r.roles,
    brand: r.brand,
    defaultDisplayQuantity: r.defaultDisplayQuantity,
    defaultDisplayUnit: r.defaultDisplayUnit,
    defaultCanonicalQuantity: r.defaultCanonicalQuantity,
    defaultCanonicalUnit: r.defaultCanonicalUnit,
  };
}

/** Minimum trigram word-similarity for a fuzzy name match (0–1; lower = more lenient). */
const SEARCH_SIMILARITY = 0.3;

export async function listItems(
  db: Db,
  opts: { search?: string; limit?: number } = {},
): Promise<InputItemSummary[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const search = opts.search?.trim();

  if (search) {
    // Fuzzy match (pg_trgm, ADR-022): word-similarity tolerates punctuation, word
    // order, and minor mishears (e.g. "pre workout" → "Dope-Max Pre-Workout");
    // an ILIKE substring catches the rest. Ranked best-match first.
    const sim = sql<number>`word_similarity(${search}, ${inputItem.name})`;
    const rows = await db.select().from(inputItem)
      .where(and(
        isNull(inputItem.deletedAt),
        sql`(${sim} > ${SEARCH_SIMILARITY} or ${inputItem.name} ilike ${"%" + search + "%"})`,
      ))
      .orderBy(sql`${sim} desc`, asc(inputItem.name))
      .limit(limit);
    return rows.map(itemSummary);
  }

  const rows = await db.select().from(inputItem)
    .where(isNull(inputItem.deletedAt))
    .orderBy(asc(inputItem.name))
    .limit(limit);
  return rows.map(itemSummary);
}

/** An item with its components (substances by name / child items by id). */
export async function getItemDetail(db: Db, id: string): Promise<InputItemDetail | null> {
  const [it] = await db.select().from(inputItem).where(
    and(eq(inputItem.id, id), isNull(inputItem.deletedAt)),
  );
  if (!it) return null;
  const comps = await db.select({
    substance: substance.name,
    childItemId: itemComponent.childItemId,
    amount: itemComponent.amount,
    unit: itemComponent.unit,
    position: itemComponent.position,
    prepState: itemComponent.prepState,
  })
    .from(itemComponent)
    .leftJoin(substance, eq(itemComponent.substanceId, substance.id))
    .where(eq(itemComponent.parentItemId, id))
    .orderBy(asc(itemComponent.position));
  const presets = await listPresets(db, [id]);
  return {
    ...itemSummary(it),
    notes: it.notes,
    version: it.version,
    components: comps,
    quickLog: it.quickLog,
    quickOrder: it.quickOrder,
    quickPresets: presets.get(id) ?? [],
  };
}

/** Amount presets keyed by item id, position-ordered. */
async function listPresets(
  db: Db,
  itemIds: string[],
): Promise<Map<string, QuickItem["quickPresets"]>> {
  const out = new Map<string, QuickItem["quickPresets"]>();
  if (!itemIds.length) return out;
  const rows = await db.select().from(quickPreset)
    .where(inArray(quickPreset.itemId, itemIds))
    .orderBy(asc(quickPreset.position));
  for (const r of rows) {
    const list = out.get(r.itemId) ?? [];
    list.push({ label: r.label, quantity: r.quantity, unit: r.unit });
    out.set(r.itemId, list);
  }
  return out;
}

/** The pinned Quick Capture favorites (ordered), each with its amount presets. */
export async function listQuickItems(db: Db): Promise<QuickItem[]> {
  const rows = await db.select().from(inputItem)
    .where(and(isNull(inputItem.deletedAt), eq(inputItem.quickLog, true)))
    .orderBy(asc(inputItem.quickOrder), asc(inputItem.name));
  const presets = await listPresets(db, rows.map((r) => r.id));
  return rows.map((r) => ({
    ...itemSummary(r),
    quickOrder: r.quickOrder,
    quickPresets: presets.get(r.id) ?? [],
  }));
}

/** Pin/unpin an item as a favorite and replace its amount presets. */
export async function setItemQuickLog(db: Db, id: string, input: SetQuickLog): Promise<boolean> {
  const [updated] = await db.update(inputItem)
    .set({ quickLog: input.quickLog, quickOrder: input.quickOrder ?? null, updatedAt: new Date() })
    .where(and(eq(inputItem.id, id), isNull(inputItem.deletedAt)))
    .returning({ id: inputItem.id });
  if (!updated) return false;
  // Presets are fully replaced when provided (unpinning clears them).
  await db.delete(quickPreset).where(eq(quickPreset.itemId, id));
  const presets = input.quickLog ? (input.presets ?? []) : [];
  if (presets.length) {
    await db.insert(quickPreset).values(
      presets.map((p, i) => ({
        itemId: id,
        position: i,
        label: p.label,
        quantity: p.quantity,
        unit: p.unit,
      })),
    );
  }
  return true;
}

/**
 * Items logged often (>= `minCount` times in the last `days`) that aren't pinned
 * yet — the basis for "you log this a lot, pin it?" suggestions on Quick Capture.
 */
export async function favoriteSuggestions(
  db: Db,
  opts: { minCount?: number; days?: number; limit?: number } = {},
): Promise<FavoriteSuggestion[]> {
  const minCount = Math.max(opts.minCount ?? 3, 2);
  const days = opts.days ?? 30;
  const limit = Math.min(Math.max(opts.limit ?? 6, 1), 20);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const count = sql<number>`count(*)`;

  const rows = await db.select({
    id: inputItem.id,
    name: inputItem.name,
    kind: inputItem.kind,
    primaryType: inputItem.primaryType,
    roles: inputItem.roles,
    brand: inputItem.brand,
    defaultDisplayQuantity: inputItem.defaultDisplayQuantity,
    defaultDisplayUnit: inputItem.defaultDisplayUnit,
    defaultCanonicalQuantity: inputItem.defaultCanonicalQuantity,
    defaultCanonicalUnit: inputItem.defaultCanonicalUnit,
    count,
  })
    .from(intakeEvent)
    .innerJoin(inputItem, eq(intakeEvent.itemId, inputItem.id))
    .where(and(
      isNull(intakeEvent.deletedAt),
      isNull(inputItem.deletedAt),
      eq(inputItem.quickLog, false),
      gte(intakeEvent.recordedAt, since),
    ))
    .groupBy(inputItem.id)
    .having(sql`count(*) >= ${minCount}`)
    .orderBy(desc(count), asc(inputItem.name))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    primaryType: r.primaryType,
    roles: r.roles,
    brand: r.brand,
    defaultDisplayQuantity: r.defaultDisplayQuantity,
    defaultDisplayUnit: r.defaultDisplayUnit,
    defaultCanonicalQuantity: r.defaultCanonicalQuantity,
    defaultCanonicalUnit: r.defaultCanonicalUnit,
    count: Number(r.count),
  }));
}

/** Per-substance totals across live events in [from, to). */
export async function dailyTotals(db: Db, from: Date, to: Date): Promise<DailyTotal[]> {
  const rows = await db.select({
    substance: substance.name,
    substanceType: substance.substanceType,
    unit: resolvedAmount.unit,
    amount: sql<number>`sum(${resolvedAmount.amount})`,
  })
    .from(resolvedAmount)
    .innerJoin(intakeEvent, eq(resolvedAmount.eventId, intakeEvent.id))
    .innerJoin(substance, eq(resolvedAmount.substanceId, substance.id))
    .where(
      and(
        isNull(intakeEvent.deletedAt),
        gte(intakeEvent.occurredAt, from),
        lt(intakeEvent.occurredAt, to),
      ),
    )
    .groupBy(substance.name, substance.substanceType, resolvedAmount.unit)
    .orderBy(substance.name);

  return rows.map((r) => ({
    substance: r.substance,
    substanceType: r.substanceType,
    unit: r.unit,
    amount: Math.round(Number(r.amount) * 1000) / 1000,
  }));
}
