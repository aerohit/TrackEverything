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
