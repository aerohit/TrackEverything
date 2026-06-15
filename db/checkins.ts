/**
 * Typed repository for Subjective State check-ins. All queries scope out
 * soft-deleted rows. Returns plain row objects; the server maps them to the
 * shared `Checkin` DTO (ISO-string timestamps) via `toCheckin`.
 */
import { and, desc, eq, gte, isNull, lt } from "drizzle-orm";
import type { Checkin, CreateCheckin, UpdateCheckin } from "../shared/subjective_state.ts";
import type { Db } from "./client.ts";
import { subjectiveState, type SubjectiveStateRow } from "./schema.ts";

/** Map a stored row to the wire DTO (timestamps as ISO strings). */
export function toCheckin(r: SubjectiveStateRow): Checkin {
  return {
    id: r.id,
    mood: r.mood ?? null,
    energy: r.energy ?? null,
    focus: r.focus ?? null,
    note: r.note ?? null,
    occurredAt: r.occurredAt.toISOString(),
    recordedAt: r.recordedAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function createCheckin(db: Db, input: CreateCheckin): Promise<SubjectiveStateRow> {
  const [row] = await db
    .insert(subjectiveState)
    .values({
      mood: input.mood ?? null,
      energy: input.energy ?? null,
      focus: input.focus ?? null,
      note: input.note ?? null,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
    })
    .returning();
  return row;
}

export interface ListRange {
  from?: Date;
  to?: Date;
  limit?: number;
}

/** Newest-first list of live check-ins, optionally within [from, to). */
export async function listCheckins(db: Db, range: ListRange = {}): Promise<SubjectiveStateRow[]> {
  const conds = [isNull(subjectiveState.deletedAt)];
  if (range.from) conds.push(gte(subjectiveState.occurredAt, range.from));
  if (range.to) conds.push(lt(subjectiveState.occurredAt, range.to));
  const limit = Math.min(Math.max(range.limit ?? 200, 1), 500);
  return await db
    .select()
    .from(subjectiveState)
    .where(and(...conds))
    .orderBy(desc(subjectiveState.occurredAt))
    .limit(limit);
}

/** Patch a live check-in; returns the updated row or null if it doesn't exist. */
export async function updateCheckin(
  db: Db,
  id: string,
  patch: UpdateCheckin,
): Promise<SubjectiveStateRow | null> {
  const values: Partial<SubjectiveStateRow> = { updatedAt: new Date() };
  if ("mood" in patch) values.mood = patch.mood ?? null;
  if ("energy" in patch) values.energy = patch.energy ?? null;
  if ("focus" in patch) values.focus = patch.focus ?? null;
  if ("note" in patch) values.note = patch.note ?? null;
  if (patch.occurredAt) values.occurredAt = new Date(patch.occurredAt);

  const [row] = await db
    .update(subjectiveState)
    .set(values)
    .where(and(eq(subjectiveState.id, id), isNull(subjectiveState.deletedAt)))
    .returning();
  return row ?? null;
}

/** Soft-delete a live check-in; returns true if a row was hidden. */
export async function softDeleteCheckin(db: Db, id: string): Promise<boolean> {
  const rows = await db
    .update(subjectiveState)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(subjectiveState.id, id), isNull(subjectiveState.deletedAt)))
    .returning({ id: subjectiveState.id });
  return rows.length > 0;
}
