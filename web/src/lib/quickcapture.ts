/**
 * Quick Capture (v2-C1) pure helpers. Turning a one-tap favorite (optionally with
 * a chosen amount preset) into an intake-log payload is the only logic worth
 * testing here, so it lives apart from the Svelte screen.
 */
import type { CreateIntake, QuickItem, QuickPreset } from "$lib/types";

/**
 * Validate a favorite's amount presets before saving. The server requires every
 * preset to have a label (plus a positive quantity and a unit), so rather than
 * silently dropping partial rows we surface an error and let the UI block the
 * save. Returns the trimmed presets when every row is complete.
 */
export function preparePresets(
  presets: QuickPreset[],
): { ok: true; presets: QuickPreset[] } | { ok: false; error: string } {
  const cleaned: QuickPreset[] = [];
  for (const p of presets) {
    const label = p.label.trim();
    const unit = p.unit.trim();
    if (!label) return { ok: false, error: 'Each preset needs a label (e.g. "250 g").' };
    if (!(p.quantity > 0)) return { ok: false, error: `Preset "${label}" needs a quantity above 0.` };
    if (!unit) return { ok: false, error: `Preset "${label}" needs a unit.` };
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
