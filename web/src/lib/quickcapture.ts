/**
 * Quick Capture (v2-C1) pure helpers. Turning a one-tap favorite (optionally with
 * a chosen amount preset) into an intake-log payload is the only logic worth
 * testing here, so it lives apart from the Svelte screen.
 */
import type { CreateIntake, QuickItem, QuickPreset } from "$lib/types";

/**
 * The label shown/saved for a preset row: the user's typed override if any,
 * otherwise a "<qty> <unit>" label derived from the amount — so a row filled
 * with just a quantity + unit still gets a sensible, editable label instead of
 * being rejected. Returns "" only when the amount itself is incomplete.
 */
export function presetLabel(
  quantity: number,
  unit: string,
  override = "",
): string {
  const o = override.trim();
  if (o) return o;
  return quantity > 0 && unit.trim() ? `${quantity} ${unit.trim()}` : "";
}

/**
 * Validate a favorite's amount presets before saving. Each needs a positive
 * quantity, a unit, and a (server-mandatory) label — but since the UI auto-derives
 * the label from the amount, a row only fails when the quantity/unit are missing.
 * Rather than silently dropping partial rows we surface an error and let the UI
 * block the save. Returns the trimmed presets when every row is complete.
 */
export function preparePresets(
  presets: QuickPreset[],
): { ok: true; presets: QuickPreset[] } | { ok: false; error: string } {
  const cleaned: QuickPreset[] = [];
  for (const p of presets) {
    const label = p.label.trim();
    const unit = p.unit.trim();
    if (!(p.quantity > 0)) {
      return { ok: false, error: "Each preset needs a quantity above 0." };
    }
    if (!unit) return { ok: false, error: "Each preset needs a unit." };
    if (!label) {
      return { ok: false, error: 'Each preset needs a label (e.g. "250 g").' };
    }
    cleaned.push({ label, quantity: p.quantity, unit });
  }
  return { ok: true, presets: cleaned };
}

/**
 * The intake payload for tapping a favorite. With a preset, log that amount;
 * otherwise fall back to the item's default serving (or "1 serving").
 */
export function quickLogPayload(
  item: QuickItem,
  preset?: QuickPreset,
): CreateIntake {
  return {
    displayName: item.name,
    itemId: item.id,
    quantity: preset?.quantity ?? item.defaultDisplayQuantity ?? 1,
    unit: preset?.unit ?? item.defaultDisplayUnit ?? "serving",
    source: "quick",
  };
}

/** Short "500 ml" style label for a favorite's default amount (for the button caption). */
export function defaultAmountLabel(item: QuickItem): string {
  const qty = item.defaultDisplayQuantity ?? 1;
  const unit = item.defaultDisplayUnit ?? "serving";
  return `${qty} ${unit}`;
}

/** Size scaler (v2-C3): log a multiple of the default serving — Small / Large etc. */
export const SIZES: { label: string; factor: number }[] = [
  { label: "½×", factor: 0.5 },
  { label: "2×", factor: 2 },
];

/** The intake payload for a sized log (factor × the default serving), rounded to 3 dp. */
export function sizeLogPayload(item: QuickItem, factor: number): CreateIntake {
  const base = item.defaultDisplayQuantity ?? 1;
  return {
    displayName: item.name,
    itemId: item.id,
    quantity: Math.round(base * factor * 1000) / 1000,
    unit: item.defaultDisplayUnit ?? "serving",
    source: "quick",
  };
}

/** Whether a favorite is a stack (a routine/recipe of member items). */
export function isStack(item: QuickItem): boolean {
  return item.stack.length > 0;
}

/**
 * The intake payload(s) for logging a stack, given the *included* member ids. A
 * stack is a one-tap shortcut for logging its members, so it always logs **one
 * event per included member** — each becomes a first-class timeline entry with its
 * own resolved nutrition (ADR-040). Returns [] if nothing is included; non-stack
 * favorites fall back to a single quick log.
 */
export function stackLogPlan(
  item: QuickItem,
  included: Set<string>,
): CreateIntake[] {
  if (!isStack(item)) return [quickLogPayload(item)];
  const members = item.stack.filter((m) => included.has(m.itemId));
  return members.map((m) => ({
    displayName: m.name,
    itemId: m.itemId,
    quantity: m.quantity,
    unit: m.unit,
    source: "quick" as const,
  }));
}

// ---- choosing when a quick-logged item was consumed (default: server's "now") ----

const pad2 = (n: number) => String(n).padStart(2, "0");

/** A Date → a local `YYYY-MM-DDTHH:MM` value for a `datetime-local` input. */
export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${
    pad2(d.getMinutes())
  }`;
}

/**
 * A `datetime-local` value ("YYYY-MM-DDTHH:MM", local) → an ISO `occurredAt`, or
 * `undefined` for a blank/invalid value (= let the server stamp "now").
 */
export function occurredAtFrom(localDateTime: string): string | undefined {
  const s = localDateTime.trim();
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Stamp a chosen `occurredAt` onto each payload (a no-op when it's undefined). */
export function applyOccurredAt(payloads: CreateIntake[], occurredAt?: string): CreateIntake[] {
  return occurredAt ? payloads.map((p) => ({ ...p, occurredAt })) : payloads;
}
