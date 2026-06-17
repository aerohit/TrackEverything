/**
 * The editable "item draft" shared by the Add Item screen and the Log screen's
 * "save as a new item" flow — both let you review/correct an item's serving and
 * ingredients before saving. These pure converters map to/from the API's
 * CreateItemBody so the form logic is unit-tested.
 */
import type { CreateItemBody } from "$lib/types";

export type CompRow = { substance: string; amount: number; unit: string };

export type ItemDraft = {
  name: string;
  kind: "product" | "recipe" | "simple";
  primaryType: string;
  dispQty: number | null;
  dispUnit: string;
  comps: CompRow[];
};

export function emptyDraft(): ItemDraft {
  return { name: "", kind: "product", primaryType: "supplement", dispQty: 1, dispUnit: "serving", comps: [] };
}

/** Pre-fill the editable draft from a recognized/scanned item (tolerant of gaps). */
export function draftFromBody(d: CreateItemBody): ItemDraft {
  return {
    name: d.name ?? "",
    kind: d.kind ?? "product",
    primaryType: d.primaryType ?? "supplement",
    dispQty: d.defaultServing?.displayQuantity ?? 1,
    dispUnit: d.defaultServing?.displayUnit ?? "serving",
    comps: (d.components ?? [])
      .filter((c) => c.substance)
      .map((c) => ({ substance: c.substance as string, amount: c.amount, unit: c.unit })),
  };
}

/** Build the API body from the edited draft, dropping blank/zero ingredient rows. */
export function draftToBody(d: ItemDraft): CreateItemBody {
  const components = d.comps
    .filter((c) => c.substance.trim() && c.amount > 0 && c.unit.trim())
    .map((c) => ({ substance: c.substance.trim(), amount: c.amount, unit: c.unit.trim() }));
  const serving: NonNullable<CreateItemBody["defaultServing"]> = {};
  if (d.dispQty != null && Number.isFinite(d.dispQty)) serving.displayQuantity = d.dispQty;
  if (d.dispUnit.trim()) serving.displayUnit = d.dispUnit.trim();
  return {
    name: d.name.trim(),
    kind: d.kind,
    primaryType: d.primaryType,
    defaultServing: Object.keys(serving).length ? serving : undefined,
    components,
  };
}
