/**
 * Drizzle schema for the v2 data model (ADR-016). One typed entity per capture
 * domain; this phase ships the first: `subjective_state` (domain 5).
 *
 * Range checks (1–5) and the "at least one rating" rule are enforced in the
 * migration SQL (db/migrations) and mirrored by the shared Zod schema.
 */
import { index, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const subjectiveState = pgTable("subjective_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Each dimension is an independent 1–5 rating; null = not rated this check-in.
  mood: smallint("mood"),
  energy: smallint("energy"),
  focus: smallint("focus"),
  note: text("note"),
  // When you felt this (UTC instant — no stored tz offset, per the owner decision).
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // Soft delete — rows are hidden, never hard-deleted.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [index("subjective_state_occurred_at_idx").on(t.occurredAt)]);

export type SubjectiveStateRow = typeof subjectiveState.$inferSelect;
export type NewSubjectiveStateRow = typeof subjectiveState.$inferInsert;
