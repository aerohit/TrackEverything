/**
 * Quick Capture (v2-C1) pure helpers. Turning a one-tap favorite (optionally with
 * a chosen amount preset) into an intake-log payload is the only logic worth
 * testing here, so it lives apart from the Svelte screen.
 */
import type { CreateIntake, QuickItem, QuickPreset } from "$lib/types";

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

/** Whether a favorite is a stack (a routine/recipe of member items). */
export function isStack(item: QuickItem): boolean {
  return item.stack.length > 0;
}

/**
 * The intake payload(s) for logging a stack given the set of *included* member ids.
 * Taking the whole stack → one event against the recipe item (a single timeline
 * entry that resolves all members). Skipping any member → one event per included
 * member instead, so the omitted ones simply aren't logged. Returns [] if nothing
 * is included. Non-stack favorites fall back to a single quick log.
 */
export function stackLogPlan(item: QuickItem, included: Set<string>): CreateIntake[] {
  if (!isStack(item)) return [quickLogPayload(item)];
  const members = item.stack.filter((m) => included.has(m.itemId));
  if (members.length === 0) return [];
  if (members.length === item.stack.length) return [quickLogPayload(item)];
  return members.map((m) => ({
    displayName: m.name,
    itemId: m.itemId,
    quantity: m.quantity,
    unit: m.unit,
    source: "quick" as const,
  }));
}
