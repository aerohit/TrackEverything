/**
 * The event-log repository: validation plus insert/read. Validation is a pure
 * function (unit-tested offline); insert/read take a `postgres` connection and
 * are exercised by the integration test against a real database.
 *
 * Dual timestamps (R-CAP-7): `occurredAt` is when it happened, `recordedAt` when
 * it was logged. After-the-fact entries set `occurredAtConfidence: "inferred"`.
 */
import type { Sql } from "npm:postgres@^3.4.4";
import {
  isKnownCategory,
  isKnownConfidence,
  isKnownSource,
  type OccurredAtConfidence,
} from "./vocab.ts";

/** Input shape for a new event (camelCase; mapped to snake_case columns). */
export interface NewEvent {
  category: string;
  occurredAt: Date | string;
  recordedAt?: Date | string;
  occurredAtConfidence?: OccurredAtConfidence;
  source: string;
  fields?: Record<string, unknown>;
  rawText?: string | null;
  templateId?: string | null;
}

/** A stored event row, as returned by Postgres. */
export interface EventRow {
  id: string;
  category: string;
  occurred_at: Date;
  recorded_at: Date;
  occurred_at_confidence: OccurredAtConfidence;
  source: string;
  fields: Record<string, unknown>;
  raw_text: string | null;
  template_id: string | null;
  created_at: Date;
}

/** Validate an event; returns a list of human-readable errors (empty = valid). */
export function validateNewEvent(input: NewEvent): string[] {
  const errors: string[] = [];

  if (!input.category || !isKnownCategory(input.category)) {
    errors.push(`category "${input.category}" is not a known category`);
  }
  if (!isValidDate(input.occurredAt)) {
    errors.push("occurredAt is required and must be a valid date/time");
  }
  if (input.recordedAt !== undefined && !isValidDate(input.recordedAt)) {
    errors.push("recordedAt must be a valid date/time when provided");
  }
  const confidence = input.occurredAtConfidence ?? "high";
  if (!isKnownConfidence(confidence)) {
    errors.push(`occurredAtConfidence must be high or inferred`);
  }
  if (!input.source || !isKnownSource(input.source)) {
    errors.push(`source "${input.source}" is not a known source`);
  }
  if (input.fields !== undefined && !isPlainObject(input.fields)) {
    errors.push("fields must be a plain object");
  }

  return errors;
}

/** Insert an event after validating it. Throws on invalid input. */
export async function insertEvent(sql: Sql, input: NewEvent): Promise<EventRow> {
  const errors = validateNewEvent(input);
  if (errors.length > 0) {
    throw new Error(`invalid event: ${errors.join("; ")}`);
  }

  const rows = await sql<EventRow[]>`
    insert into events (
      category, occurred_at, recorded_at, occurred_at_confidence,
      source, fields, raw_text, template_id
    ) values (
      ${input.category},
      ${toDate(input.occurredAt)},
      ${input.recordedAt ? toDate(input.recordedAt) : new Date()},
      ${input.occurredAtConfidence ?? "high"},
      ${input.source},
      ${sql.json((input.fields ?? {}) as unknown as Parameters<typeof sql.json>[0])},
      ${input.rawText ?? null},
      ${input.templateId ?? null}
    )
    returning *
  `;
  return rows[0];
}

/** Read a single event by id, or null if not found. */
export async function getEvent(sql: Sql, id: string): Promise<EventRow | null> {
  const rows = await sql<EventRow[]>`select * from events where id = ${id}`;
  return rows[0] ?? null;
}

function isValidDate(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === "string") return !Number.isNaN(new Date(value).getTime());
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
