/**
 * Typed repository for Subjective State readings (immutable — only create + read;
 * no update/delete, per ADR-017). Returns plain rows; the server maps them to the
 * shared `Checkin` DTO (ISO `recordedAt`) via `toCheckin`.
 */
import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { Checkin, CreateCheckin, SubjectiveKind } from "../shared/subjective_state.ts";
import type { Db } from "./client.ts";
import { subjectiveState, type SubjectiveStateRow } from "./schema.ts";

/** Map a stored row to the wire DTO (recordedAt as an ISO string). */
export function toCheckin(r: SubjectiveStateRow): Checkin {
  return {
    id: r.id,
    kind: r.kind,
    rating: r.rating,
    note: r.note ?? null,
    recordedAt: r.recordedAt.toISOString(),
  };
}

/**
 * Record a check-in: insert one row per reading. A single multi-row insert means
 * every row of the check-in shares the same `recorded_at` (so they group), and the
 * optional note is attached to each. Returns the created rows.
 */
export async function createCheckin(db: Db, input: CreateCheckin): Promise<SubjectiveStateRow[]> {
  const note = input.note ?? null;
  return await db
    .insert(subjectiveState)
    .values(input.readings.map((r) => ({ kind: r.kind, rating: r.rating, note })))
    .returning();
}

export interface ListRange {
  from?: Date;
  to?: Date;
  limit?: number;
  kind?: SubjectiveKind;
}

/** Newest-first list of readings, optionally filtered by [from, to) and/or kind. */
export async function listCheckins(db: Db, range: ListRange = {}): Promise<SubjectiveStateRow[]> {
  const conds = [];
  if (range.from) conds.push(gte(subjectiveState.recordedAt, range.from));
  if (range.to) conds.push(lt(subjectiveState.recordedAt, range.to));
  if (range.kind) conds.push(eq(subjectiveState.kind, range.kind));
  const limit = Math.min(Math.max(range.limit ?? 200, 1), 500);
  return await db
    .select()
    .from(subjectiveState)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(subjectiveState.recordedAt))
    .limit(limit);
}
