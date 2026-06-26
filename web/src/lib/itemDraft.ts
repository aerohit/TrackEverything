/**
 * The editable "item draft" shared by the Add Item screen and the Log screen's
 * "save as a new item" flow — both let you review/correct an item's serving and
 * ingredients before saving. These pure converters map to/from the API's
 * CreateItemBody so the form logic is unit-tested.
 */
import type { CreateItemBody, InputItemSummary } from "$lib/types";

/**
 * Which catalog items may be added as members of a draft of this mode:
 * a **recipe** accepts only `product` items (a recipe is built from products);
 * a **stack** accepts any non-stack item (products and recipes, never another stack).
 */
export function eligibleMembers(
  items: InputItemSummary[],
  mode: "recipe" | "stack",
): InputItemSummary[] {
  return mode === "recipe"
    ? items.filter((i) => i.kind === "product")
    : items.filter((i) => i.kind !== "stack");
}

/**
 * Up to 8 catalog items whose name matches the query (case-insensitive substring);
 * an empty/blank query returns the first few. Powers the member typeahead (a custom
 * dropdown, since `<datalist>` autocomplete is unreliable on mobile browsers).
 */
export function searchMembers(
  items: InputItemSummary[],
  query: string,
): InputItemSummary[] {
  const q = query.trim().toLowerCase();
  const pool = q
    ? items.filter((it) =>
      it.name.toLowerCase().includes(q) ||
      it.aliases.some((a) => a.toLowerCase().includes(q))
    )
    : items;
  return pool.slice(0, 8);
}

export type CompRow = { substance: string; amount: number; unit: string };
// A member of a stack/recipe: another item, by id (resolved from its name in the editor).
export type MemberRow = { itemId: string; name: string; quantity: number; unit: string };

export type ItemDraft = {
  name: string;
  kind: "product" | "recipe" | "stack";
  dispQty: number | null;
  dispUnit: string;
  // Optional analysable serving size, e.g. "1 steak = 250 g": canonQty 250, canonUnit "g".
  // Lets the item be logged by weight/volume as well as by its display serving.
  canonQty: number | null;
  canonUnit: string;
  comps: CompRow[];
  // Stack/recipe members — other items this one is made of (childItemId components).
  members: MemberRow[];
};

export function emptyDraft(): ItemDraft {
  return {
    name: "",
    kind: "product",
    dispQty: 1,
    dispUnit: "serving",
    canonQty: null,
    canonUnit: "",
    comps: [],
    members: [],
  };
}

/** Pre-fill the editable draft from a recognized/scanned item (tolerant of gaps). */
export function draftFromBody(d: CreateItemBody): ItemDraft {
  return {
    name: d.name ?? "",
    kind: d.kind ?? "product",
    dispQty: d.defaultServing?.displayQuantity ?? 1,
    dispUnit: d.defaultServing?.displayUnit ?? "serving",
    canonQty: d.defaultServing?.canonicalQuantity ?? null,
    canonUnit: d.defaultServing?.canonicalUnit ?? "",
    comps: (d.components ?? [])
      .filter((c) => c.substance)
      .map((c) => ({ substance: c.substance as string, amount: c.amount, unit: c.unit })),
    members: [], // built in the editor; recognized/scanned drafts have no member items
  };
}

/**
 * True if any member row has a typed name that didn't resolve to a catalog item.
 * draftToBody silently drops these, so the editor uses this to block save — otherwise
 * a mis-typed (or un-picked) ingredient/member vanishes with no warning.
 */
export function hasUnresolvedMembers(d: ItemDraft): boolean {
  return d.members.some((m) => m.name.trim() !== "" && !m.itemId);
}

/** Build the API body from the edited draft, dropping blank/zero ingredient rows. */
export function draftToBody(d: ItemDraft): CreateItemBody {
  const substanceComps = d.comps
    .filter((c) => c.substance.trim() && c.amount > 0 && c.unit.trim())
    .map((c) => ({ substance: c.substance.trim(), amount: c.amount, unit: c.unit.trim() }));
  // Stack members become childItemId components (only those resolved to a real item).
  const memberComps = d.members
    .filter((m) => m.itemId && m.quantity > 0 && m.unit.trim())
    .map((m) => ({ childItemId: m.itemId, amount: m.quantity, unit: m.unit.trim() }));
  const components = [...substanceComps, ...memberComps];
  const serving: NonNullable<CreateItemBody["defaultServing"]> = {};
  if (d.dispQty != null && Number.isFinite(d.dispQty)) serving.displayQuantity = d.dispQty;
  if (d.dispUnit.trim()) serving.displayUnit = d.dispUnit.trim();
  if (d.canonQty != null && Number.isFinite(d.canonQty) && d.canonQty > 0) {
    serving.canonicalQuantity = d.canonQty;
  }
  if (d.canonUnit.trim()) serving.canonicalUnit = d.canonUnit.trim();
  return {
    name: d.name.trim(),
    kind: d.kind,
    defaultServing: Object.keys(serving).length ? serving : undefined,
    components,
  };
}
