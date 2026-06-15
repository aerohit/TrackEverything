/**
 * Repository for the Inputs domain (ADR-018). Creates reusable items, logs intake
 * events (running the resolver and freezing a per-event snapshot in resolved_amount),
 * edits/soft-deletes events (mutable), lists events with their resolution, and rolls
 * a day up into per-substance totals.
 */
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, sql } from "drizzle-orm";
import type {
  Confidence,
  CreateIntakeEvent,
  CreateItem,
  DailyTotal,
  InputItemDetail,
  InputItemSummary,
  IntakeEvent,
  Substance,
  SubstanceUnit,
  UpdateIntakeEvent,
} from "../shared/inputs.ts";
import type { Db } from "./client.ts";
import {
  inputItem,
  type InputItemRow,
  intakeEvent,
  itemComponent,
  resolvedAmount,
  substance,
} from "./schema.ts";
import { convert, type ResolveGraph, type ResolveItem, resolveItem } from "./resolve.ts";

interface SubstanceMeta {
  id: string;
  unit: SubstanceUnit;
}

/** name + each alias (lowercased) → {id, canonical unit}. */
async function substanceIndex(db: Db): Promise<Map<string, SubstanceMeta>> {
  const rows = await db.select().from(substance);
  const m = new Map<string, SubstanceMeta>();
  for (const s of rows) {
    const meta = { id: s.id, unit: s.canonicalUnit };
    m.set(s.name.toLowerCase(), meta);
    for (const a of s.aliases) m.set(a.toLowerCase(), meta);
  }
  return m;
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
    const rows = components.map((c, i) => {
      let substanceId: string | null = null;
      if (c.substance) {
        const meta = subs.get(c.substance.toLowerCase());
        if (!meta) throw new Error(`Unknown substance: ${c.substance}`);
        substanceId = meta.id;
      }
      return {
        parentItemId: item.id,
        substanceId,
        childItemId: c.childItemId ?? null,
        amount: c.amount,
        unit: c.unit,
        position: c.position ?? i,
        prepState: c.prepState ?? null,
      };
    });
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
    const rows = input.resolved.map((r) => {
      const meta = subs.get(r.substance.toLowerCase());
      if (!meta) throw new Error(`Unknown substance: ${r.substance}`);
      const amt = convert(r.amount, r.unit, meta.unit) ?? r.amount;
      return {
        substanceId: meta.id,
        amount: Math.round(amt * 1000) / 1000,
        unit: meta.unit,
        confidence: r.confidence ?? baseConfidence,
        source: "manual",
      };
    });
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

export async function listItems(
  db: Db,
  opts: { search?: string; limit?: number } = {},
): Promise<InputItemSummary[]> {
  const conds = [isNull(inputItem.deletedAt)];
  if (opts.search) conds.push(ilike(inputItem.name, `%${opts.search}%`));
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const rows = await db.select().from(inputItem)
    .where(and(...conds))
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
  return { ...itemSummary(it), notes: it.notes, version: it.version, components: comps };
}

/** Per-substance totals across live events in [from, to). */
export async function dailyTotals(db: Db, from: Date, to: Date): Promise<DailyTotal[]> {
  const rows = await db.select({
    substance: substance.name,
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
    .groupBy(substance.name, resolvedAmount.unit)
    .orderBy(substance.name);

  return rows.map((r) => ({
    substance: r.substance,
    unit: r.unit,
    amount: Math.round(Number(r.amount) * 1000) / 1000,
  }));
}
