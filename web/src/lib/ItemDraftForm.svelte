<script lang="ts">
  import type { InputItemSummary, Substance } from "$lib/types";
  import type { ItemDraft } from "$lib/itemDraft";
  import { measureUnitOptions, substanceUnitOptions, unitOptions } from "$lib/units";

  // Editable item fields shared by the Add Item screen and the Log screen's "save
  // as a new item" flow. `mode` picks the form: an **item** (product/recipe/simple,
  // with a serving + substance ingredients) or a **stack** (composed only of other
  // non-stack items).
  let { draft = $bindable(), substances = [], items = [], mode = "item" }: {
    draft: ItemDraft;
    substances?: Substance[];
    items?: InputItemSummary[]; // catalog, for picking stack members
    mode?: "item" | "stack";
  } = $props();

  // An item is product / recipe / simple; "stack" is its own dedicated form.
  const ITEM_KINDS = ["product", "recipe", "simple"] as const;
  const TYPES = ["food", "drink", "supplement", "medication", "meal", "other"];

  // A stack can only be composed of simple / product / recipe items, never another stack.
  const memberItems = $derived(items.filter((i) => i.kind !== "stack"));

  function addComp() {
    draft.comps = [...draft.comps, { substance: "", amount: 1, unit: "mg" }];
  }
  function removeComp(i: number) {
    draft.comps = draft.comps.filter((_, idx) => idx !== i);
  }

  function addMember() {
    draft.members = [...draft.members, { itemId: "", name: "", quantity: 1, unit: "serving" }];
  }
  function removeMember(i: number) {
    draft.members = draft.members.filter((_, idx) => idx !== i);
  }
  // Resolve a typed member name to a (non-stack) catalog item; prefill its unit/qty.
  function onMemberName(i: number) {
    const n = draft.members[i].name.trim().toLowerCase();
    const it = memberItems.find((x) => x.name.toLowerCase() === n);
    draft.members[i].itemId = it?.id ?? "";
    if (it) {
      draft.members[i].unit = it.defaultDisplayUnit ?? "serving";
      if (!(draft.members[i].quantity > 0)) draft.members[i].quantity = it.defaultDisplayQuantity ?? 1;
    }
  }
</script>

<div class="fieldlabel">Name</div>
<input class="field" placeholder={mode === "stack" ? "Stack name (e.g. Morning Stack)" : "Item name"} bind:value={draft.name} />

<div class="row" style="margin-top:8px">
  {#if mode === "item"}
    <div style="flex:1">
      <div class="fieldlabel">Kind</div>
      <select class="field" bind:value={draft.kind}>
        {#each ITEM_KINDS as k}<option value={k}>{k}</option>{/each}
      </select>
    </div>
  {/if}
  <div style="flex:1">
    <div class="fieldlabel">Type</div>
    <select class="field" bind:value={draft.primaryType}>
      {#each TYPES as t}<option value={t}>{t}</option>{/each}
    </select>
  </div>
</div>

{#if mode === "item"}
  <div class="fieldlabel">Serving</div>
  <div class="row">
    <input class="field" type="number" min="0" step="any" placeholder="qty" bind:value={draft.dispQty} />
    <select class="field" aria-label="Serving unit" bind:value={draft.dispUnit}>
      {#each unitOptions(draft.dispUnit) as u}<option value={u}>{u}</option>{/each}
    </select>
  </div>

  <div class="fieldlabel">Serving in grams/ml (optional)</div>
  <p class="mut" style="margin:0 0 4px">
    What one serving weighs/measures, so you can also log by weight — e.g. "1 steak" + "250 g"
    lets you log either "1 steak" or "250 g".
  </p>
  <div class="row">
    <input class="field" type="number" min="0" step="any" placeholder="qty (e.g. 250)" bind:value={draft.canonQty} />
    <select class="field" aria-label="Serving measurement unit" bind:value={draft.canonUnit}>
      <option value="">— none —</option>
      {#each measureUnitOptions(draft.canonUnit) as u}<option value={u}>{u}</option>{/each}
    </select>
  </div>

  <div class="fieldlabel">Ingredients (per serving)</div>
  {#each draft.comps as c, i}
    <div class="row" style="margin-top:6px">
      <input class="field" style="flex:2" placeholder="substance" list="df-substances" bind:value={c.substance} />
      <input class="field" style="flex:1" type="number" min="0" step="any" placeholder="amt" bind:value={c.amount} />
      <select class="field" style="flex:1" aria-label="Ingredient unit" bind:value={c.unit}>
        {#each substanceUnitOptions(c.unit) as u}<option value={u}>{u}</option>{/each}
      </select>
      <button class="iconbtn" aria-label="Remove ingredient" onclick={() => removeComp(i)}>✕</button>
    </div>
  {/each}
  <datalist id="df-substances">
    {#each substances as s}<option value={s.name}></option>{/each}
  </datalist>
  <button class="ghostbtn" onclick={addComp}>+ Add ingredient</button>
{:else}
  <div class="fieldlabel">Members (items in this stack)</div>
  <p class="mut" style="margin:0 0 4px">
    A stack is built from items you've already added — e.g. a "Morning Stack" of your supplements.
    One tap on the stack logs them all (and you can skip any on the day). Stacks can't contain other
    stacks.
  </p>
  {#each draft.members as m, i}
    <div class="row" style="margin-top:6px">
      <input
        class="field"
        style="flex:2"
        placeholder="item name"
        list="df-members"
        bind:value={m.name}
        oninput={() => onMemberName(i)}
      />
      <input class="field" style="flex:1" type="number" min="0" step="any" placeholder="qty" bind:value={m.quantity} />
      <select class="field" style="flex:1" aria-label="Member unit" bind:value={m.unit}>
        {#each unitOptions(m.unit) as u}<option value={u}>{u}</option>{/each}
      </select>
      <button class="iconbtn" aria-label="Remove member" onclick={() => removeMember(i)}>✕</button>
    </div>
    {#if m.name.trim() && !m.itemId}
      <p class="mut" style="margin:2px 0 0; color:var(--danger)">No item named "{m.name}" — add it first (stacks can't be members).</p>
    {/if}
  {/each}
  <datalist id="df-members">
    {#each memberItems as it}<option value={it.name}></option>{/each}
  </datalist>
  <button class="ghostbtn" onclick={addMember}>+ Add member</button>
{/if}
