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
export function presetLabel(quantity: number, unit: string, override = ""): string {
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
    if (!(p.quantity > 0)) return { ok: false, error: "Each preset needs a quantity above 0." };
    if (!unit) return { ok: false, error: "Each preset needs a unit." };
    if (!label) return { ok: false, error: 'Each preset needs a label (e.g. "250 g").' };
    cleaned.push({ label, quantity: p.quantity, unit });
  }
  return { ok: true, presets: cleaned };
}

/**
 * The intake payload for tapping a favorite. With a preset, log that amount;
 * otherwise fall back to the item's default serving (or "1 serving").
 */
export function quickLogPayload(item: QuickItem, preset?: QuickPreset): CreateIntake {
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

/** How a stack is stored when logged: one combined entry vs one entry per item. */
export type StackMode = "single" | "separate";

/**
 * The intake payload(s) for logging a stack, given the *included* member ids and
 * the chosen mode. **single** (only when every member is included) → one event
 * against the stack item — a single timeline entry the resolver expands into its
 * members. **separate** (or any skip) → one event per included member. Returns []
 * if nothing is included; non-stack favorites fall back to a single quick log.
 */
export function stackLogPlan(item: QuickItem, included: Set<string>, mode: StackMode): CreateIntake[] {
  if (!isStack(item)) return [quickLogPayload(item)];
  const members = item.stack.filter((m) => included.has(m.itemId));
  if (members.length === 0) return [];
  if (mode === "single" && members.length === item.stack.length) return [quickLogPayload(item)];
  return members.map((m) => ({
    displayName: m.name,
    itemId: m.itemId,
    quantity: m.quantity,
    unit: m.unit,
    source: "quick" as const,
  }));
}
