/**
 * Drizzle schema for the v2 data model (ADR-016/017). One typed entity per
 * capture domain; this phase ships the first: Subjective State (domain 5).
 *
 * Subjective State is modelled as immutable readings: a `kind` discriminator
 * (Postgres enum — extend it to track new states, no new columns) + a 1–5
 * `rating`, stamped once at `recorded_at`. No update/soft-delete columns — the
 * row never changes after insert. Range/enum integrity is enforced here and in
 * the migration, mirrored by the shared Zod schema.
 */
import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { SUBJECTIVE_KINDS } from "../shared/subjective_state.ts";

export const subjectiveKind = pgEnum("subjective_kind", SUBJECTIVE_KINDS);

export const subjectiveState = pgTable("subjective_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: subjectiveKind("kind").notNull(),
  rating: integer("rating").notNull(),
  note: text("note"),
  // When you recorded it. Immutable — this is the only timestamp (ADR-017).
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("subjective_state_recorded_at_idx").on(t.recordedAt)]);

export type SubjectiveStateRow = typeof subjectiveState.$inferSelect;
export type NewSubjectiveStateRow = typeof subjectiveState.$inferInsert;
