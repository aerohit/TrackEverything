/**
 * Phase 4: quick-log templates. A template is a named, pre-filled event spec
 * ("my coffee" → drink with {item: coffee, caffeine_mg: 120}). Logging a template
 * expands it into an event at tap time (source "quicklog"), optionally merging
 * per-tap overrides.
 *
 * `expandTemplate` is a pure function (unit-tested); the rest take a `postgres`
 * connection and are covered by integration tests.
 */
import type { Sql } from "npm:postgres@^3.4.4";
import type { NewEvent } from "./events.ts";
import { isKnownCategory } from "./vocab.ts";

export interface NewTemplate {
  name: string;
  category: string;
  defaultFields?: Record<string, unknown>;
  itemId?: string | null;
}

export interface TemplateRow {
  id: string;
  name: string;
  category: string;
  default_fields: Record<string, unknown>;
  item_id: string | null;
  created_at: Date;
}

export interface ExpandOptions {
  /** Tap time — the default for occurredAt. */
  now: Date;
  /** Override when it happened (after-the-fact logging). */
  occurredAt?: Date | string;
  /** Per-tap field overrides, merged over the template's defaults. */
  fields?: Record<string, unknown>;
}

/** Validate a template; returns human-readable errors (empty = valid). */
export function validateNewTemplate(input: NewTemplate): string[] {
  const errors: string[] = [];
  if (!input.name || input.name.trim() === "") {
    errors.push("name is required");
  }
  if (!input.category || !isKnownCategory(input.category)) {
    errors.push(`category "${input.category}" is not a known category`);
  }
  if (input.defaultFields !== undefined && !isPlainObject(input.defaultFields)) {
    errors.push("defaultFields must be an object");
  }
  return errors;
}

/** Expand a template into a new event. Per-tap overrides win over defaults. */
export function expandTemplate(template: TemplateRow, opts: ExpandOptions): NewEvent {
  return {
    category: template.category,
    occurredAt: opts.occurredAt ?? opts.now,
    occurredAtConfidence: "high",
    source: "quicklog",
    fields: { ...template.default_fields, ...(opts.fields ?? {}) },
    rawText: null,
    templateId: template.id,
  };
}

export async function createTemplate(sql: Sql, input: NewTemplate): Promise<TemplateRow> {
  const errors = validateNewTemplate(input);
  if (errors.length > 0) {
    throw new Error(`invalid template: ${errors.join("; ")}`);
  }
  const rows = await sql<TemplateRow[]>`
    insert into templates (name, category, default_fields, item_id)
    values (
      ${input.name},
      ${input.category},
      ${sql.json((input.defaultFields ?? {}) as unknown as Parameters<typeof sql.json>[0])},
      ${input.itemId ?? null}
    )
    returning *
  `;
  return rows[0];
}

export async function getTemplateByName(sql: Sql, name: string): Promise<TemplateRow | null> {
  const rows = await sql<TemplateRow[]>`select * from templates where name = ${name}`;
  return rows[0] ?? null;
}

export async function listTemplates(sql: Sql): Promise<TemplateRow[]> {
  return await sql<TemplateRow[]>`select * from templates order by name`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
