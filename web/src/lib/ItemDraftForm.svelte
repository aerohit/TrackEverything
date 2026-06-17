<script lang="ts">
  import type { Substance } from "$lib/types";
  import type { ItemDraft } from "$lib/itemDraft";

  // Editable item fields (name, kind, type, serving, ingredient rows) shared by the
  // Add Item screen and the Log screen's "save as a new item" flow.
  let { draft = $bindable(), substances = [] }: { draft: ItemDraft; substances?: Substance[] } = $props();

  const KINDS = ["product", "recipe", "simple"] as const;
  const TYPES = ["food", "drink", "supplement", "medication", "meal", "other"];

  function addComp() {
    draft.comps = [...draft.comps, { substance: "", amount: 1, unit: "mg" }];
  }
  function removeComp(i: number) {
    draft.comps = draft.comps.filter((_, idx) => idx !== i);
  }
</script>

<div class="fieldlabel">Name</div>
<input class="field" placeholder="Item name" bind:value={draft.name} />

<div class="row" style="margin-top:8px">
  <div style="flex:1">
    <div class="fieldlabel">Kind</div>
    <select class="field" bind:value={draft.kind}>
      {#each KINDS as k}<option value={k}>{k}</option>{/each}
    </select>
  </div>
  <div style="flex:1">
    <div class="fieldlabel">Type</div>
    <select class="field" bind:value={draft.primaryType}>
      {#each TYPES as t}<option value={t}>{t}</option>{/each}
    </select>
  </div>
</div>

<div class="fieldlabel">Serving</div>
<div class="row">
  <input class="field" type="number" min="0" step="any" placeholder="qty" bind:value={draft.dispQty} />
  <input class="field" placeholder="unit (scoop, tablet, g…)" bind:value={draft.dispUnit} />
</div>

<div class="fieldlabel">Serving in grams/ml (optional)</div>
<p class="mut" style="margin:0 0 4px">
  What one serving weighs/measures, so you can also log by weight — e.g. "1 steak" + "250 g"
  lets you log either "1 steak" or "250 g".
</p>
<div class="row">
  <input class="field" type="number" min="0" step="any" placeholder="qty (e.g. 250)" bind:value={draft.canonQty} />
  <input class="field" placeholder="unit (g, ml…)" bind:value={draft.canonUnit} />
</div>

<div class="fieldlabel">Ingredients (per serving)</div>
{#each draft.comps as c, i}
  <div class="row" style="margin-top:6px">
    <input class="field" style="flex:2" placeholder="substance" list="df-substances" bind:value={c.substance} />
    <input class="field" style="flex:1" type="number" min="0" step="any" placeholder="amt" bind:value={c.amount} />
    <input class="field" style="flex:1" placeholder="unit" bind:value={c.unit} />
    <button class="iconbtn" aria-label="Remove ingredient" onclick={() => removeComp(i)}>✕</button>
  </div>
{/each}
<datalist id="df-substances">
  {#each substances as s}<option value={s.name}></option>{/each}
</datalist>
<button class="ghostbtn" onclick={addComp}>+ Add ingredient</button>
