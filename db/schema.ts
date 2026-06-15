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
import {
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { SUBJECTIVE_KINDS } from "../shared/subjective_state.ts";
import {
  CONFIDENCE_LEVELS,
  INPUT_KINDS,
  INPUT_PRIMARY_TYPES,
  SUBSTANCE_TYPES,
  SUBSTANCE_UNITS,
} from "../shared/inputs.ts";

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

// ---- Inputs domain (v2-2, ADR-018) ----

export const substanceType = pgEnum("substance_type", SUBSTANCE_TYPES);
export const substanceUnit = pgEnum("substance_unit", SUBSTANCE_UNITS);
export const inputKind = pgEnum("input_kind", INPUT_KINDS);
export const inputPrimaryType = pgEnum("input_primary_type", INPUT_PRIMARY_TYPES);
export const intakeConfidence = pgEnum("intake_confidence", CONFIDENCE_LEVELS);

export const substance = pgTable("substance", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  substanceType: substanceType("substance_type").notNull(),
  canonicalUnit: substanceUnit("canonical_unit").notNull(),
  aliases: text("aliases").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inputItem = pgTable("input_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: inputKind("kind").notNull(),
  primaryType: inputPrimaryType("primary_type").notNull(),
  roles: text("roles").array().notNull().default([]),
  brand: text("brand"),
  defaultDisplayQuantity: doublePrecision("default_display_quantity"),
  defaultDisplayUnit: text("default_display_unit"),
  defaultCanonicalQuantity: doublePrecision("default_canonical_quantity"),
  defaultCanonicalUnit: text("default_canonical_unit"),
  version: integer("version").notNull().default(1),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [index("input_item_name_idx").on(t.name)]);

export const itemComponent = pgTable("item_component", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentItemId: uuid("parent_item_id").notNull().references(() => inputItem.id, {
    onDelete: "cascade",
  }),
  substanceId: uuid("substance_id").references(() => substance.id),
  childItemId: uuid("child_item_id").references(() => inputItem.id),
  amount: doublePrecision("amount").notNull(),
  unit: text("unit").notNull(),
  position: integer("position").notNull().default(0),
  prepState: text("prep_state"),
}, (t) => [index("item_component_parent_idx").on(t.parentItemId)]);

export const intakeEvent = pgTable("intake_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  displayName: text("display_name").notNull(),
  itemId: uuid("item_id").references(() => inputItem.id, { onDelete: "set null" }),
  itemVersion: integer("item_version"),
  quantity: doublePrecision("quantity").notNull(),
  unit: text("unit").notNull(),
  canonicalQuantity: doublePrecision("canonical_quantity"),
  canonicalUnit: text("canonical_unit"),
  confidence: intakeConfidence("confidence").notNull().default("medium"),
  contextTags: text("context_tags").array().notNull().default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [index("intake_event_occurred_at_idx").on(t.occurredAt)]);

export const resolvedAmount = pgTable("resolved_amount", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => intakeEvent.id, { onDelete: "cascade" }),
  substanceId: uuid("substance_id").notNull().references(() => substance.id),
  amount: doublePrecision("amount").notNull(),
  unit: substanceUnit("unit").notNull(),
  confidence: intakeConfidence("confidence").notNull().default("medium"),
  source: text("source").notNull().default("manual"),
}, (t) => [index("resolved_amount_event_idx").on(t.eventId)]);

export type SubstanceRow = typeof substance.$inferSelect;
export type InputItemRow = typeof inputItem.$inferSelect;
export type ItemComponentRow = typeof itemComponent.$inferSelect;
export type IntakeEventRow = typeof intakeEvent.$inferSelect;
export type ResolvedAmountRow = typeof resolvedAmount.$inferSelect;
