<script lang="ts">
  import type { InputItemSummary, Substance } from "$lib/types";
  import { eligibleMembers, type ItemDraft, searchMembers } from "$lib/itemDraft";
  import { measureUnitOptions, substanceUnitOptions, unitOptions } from "$lib/units";

  // Editable item fields shared by the Add Item screen and the Log screen's "save as a
  // new item" flow. `mode` picks the form:
  //   item   — a **product** (serving + substance ingredients);
  //   recipe — a dish built from **product** members (serving + product members);
  //   stack  — a routine of any non-stack items (members only, no serving).
  let { draft = $bindable(), substances = [], items = [], mode = "item" }: {
    draft: ItemDraft;
    substances?: Substance[];
    items?: InputItemSummary[]; // catalog, for picking recipe/stack members
    mode?: "item" | "recipe" | "stack";
  } = $props();

  const hasServing = $derived(mode === "item" || mode === "recipe");
  const hasMembers = $derived(mode === "recipe" || mode === "stack");
  // Recipes accept only products; stacks accept any non-stack item.
  const memberItems = $derived(
    mode === "item" ? [] : eligibleMembers(items, mode),
  );

  const namePlaceholder = $derived(
    mode === "stack"
      ? "Stack name (e.g. Morning Stack)"
      : mode === "recipe"
      ? "Recipe name (e.g. Protein Smoothie)"
      : "Item name",
  );

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
  // Resolve a typed member name to an eligible catalog item; prefill its unit/qty.
  function onMemberName(i: number) {
    const n = draft.members[i].name.trim().toLowerCase();
    const it = memberItems.find((x) => x.name.toLowerCase() === n);
    draft.members[i].itemId = it?.id ?? "";
    if (it) {
      draft.members[i].unit = it.defaultDisplayUnit ?? "serving";
      if (!(draft.members[i].quantity > 0)) draft.members[i].quantity = it.defaultDisplayQuantity ?? 1;
    }
  }

  // Custom member typeahead — `<datalist>` autocomplete is unreliable on mobile
  // (iOS Safari shows nothing as you type), so we render our own tap-friendly list.
  let openRow = $state(-1);
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  function pickMember(i: number, it: InputItemSummary) {
    draft.members[i].name = it.name;
    onMemberName(i);
    clearTimeout(closeTimer);
    openRow = -1;
  }
  // Close after a tick so a tap on an option registers before blur hides the list.
  function closeMenuSoon() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => (openRow = -1), 150);
  }
</script>

<div class="fieldlabel">Name</div>
<input class="field" placeholder={namePlaceholder} bind:value={draft.name} />

{#if hasServing}
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
{/if}

{#if mode === "item"}
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
{/if}

{#if hasMembers}
  <div class="fieldlabel">{mode === "recipe" ? "Ingredients (products, per serving)" : "Members (items in this stack)"}</div>
  <p class="mut" style="margin:0 0 4px">
    {#if mode === "recipe"}
      A recipe is built from <b>products</b> you've already added — e.g. a smoothie of Whey + Milk +
      Banana. Only products in your catalog can be added (add the product first if it's missing).
    {:else}
      A stack is built from items you've already added — e.g. a "Morning Stack" of your supplements.
      One tap on the stack logs them all (and you can skip any on the day). Stacks can't contain other
      stacks.
    {/if}
  </p>
  {#each draft.members as m, i}
    <div class="row" style="margin-top:6px">
      <div class="ac" style="flex:2">
        <input
          class="field"
          style="width:100%"
          placeholder={mode === "recipe" ? "search products" : "search items"}
          autocomplete="off"
          bind:value={m.name}
          oninput={() => {
            onMemberName(i);
            openRow = i;
          }}
          onfocus={() => (openRow = i)}
          onblur={closeMenuSoon}
        />
        {#if openRow === i}
          {@const opts = searchMembers(memberItems, m.name)}
          {#if opts.length}
            <ul class="acmenu">
              {#each opts as it}
                <li>
                  <button
                    type="button"
                    class="acitem"
                    onpointerdown={(e) => e.preventDefault()}
                    onclick={() => pickMember(i, it)}
                  >{it.name}</button>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
      <input class="field" style="flex:1" type="number" min="0" step="any" placeholder="qty" bind:value={m.quantity} />
      <select class="field" style="flex:1" aria-label="Member unit" bind:value={m.unit}>
        {#each unitOptions(m.unit) as u}<option value={u}>{u}</option>{/each}
      </select>
      <button class="iconbtn" aria-label="Remove member" onclick={() => removeMember(i)}>✕</button>
    </div>
    {#if m.name.trim() && !m.itemId}
      <p class="mut" style="margin:2px 0 0; color:var(--danger)">
        {#if mode === "recipe"}
          No product named "{m.name}" — only products already in your catalog can be added.
        {:else}
          No item named "{m.name}" — add it first (stacks can't be members).
        {/if}
      </p>
    {/if}
  {/each}
  <button class="ghostbtn" onclick={addMember}>+ Add {mode === "recipe" ? "product" : "member"}</button>
{/if}

<style>
  /* Tap-friendly member typeahead (replaces <datalist>, which is unreliable on mobile). */
  .ac {
    position: relative;
  }
  .acmenu {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    /* Grow wider than the (narrow) name column so product names fit on one line;
       it's a popup layered above the fields below, so overlapping them is fine. */
    min-width: min(260px, 84vw);
    max-width: 84vw;
    z-index: 40;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: var(--shadow);
    max-height: 240px;
    overflow-y: auto;
  }
  .acitem {
    display: block;
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    border: 0;
    border-radius: 7px;
    background: none;
    font: inherit;
    color: var(--fg);
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .acitem:hover,
  .acitem:focus {
    background: var(--accent-soft);
  }
</style>
