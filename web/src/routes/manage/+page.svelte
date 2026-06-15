<script lang="ts">
  import { onMount } from "svelte";
  import { createItem, listItems, listSubstances } from "$lib/api";
  import type { CreateItemBody, InputItemSummary, Substance } from "$lib/types";

  type CompRow = {
    mode: "substance" | "item";
    substance: string;
    childItemId: string;
    amount: number;
    unit: string;
  };

  const KINDS = ["product", "recipe", "simple"] as const;
  const TYPES = ["food", "drink", "supplement", "medication", "meal", "other"];

  let name = $state("");
  let kind = $state<"product" | "recipe" | "simple">("product");
  let primaryType = $state("supplement");
  let rolesInput = $state("");
  let dispQty = $state<number | null>(1);
  let dispUnit = $state("");
  let canQty = $state<number | null>(null);
  let canUnit = $state("");
  let notes = $state("");
  let comps = $state<CompRow[]>([blankComp()]);

  let substances = $state<Substance[]>([]);
  let items = $state<InputItemSummary[]>([]);
  let saving = $state(false);
  let toast = $state<{ msg: string; err: boolean } | null>(null);

  function blankComp(): CompRow {
    return { mode: "substance", substance: "", childItemId: "", amount: 1, unit: "" };
  }
  function flash(msg: string, err = false) {
    toast = { msg, err };
    setTimeout(() => (toast = null), 3000);
  }
  function addComp() {
    comps = [...comps, blankComp()];
  }
  function removeComp(i: number) {
    comps = comps.filter((_, idx) => idx !== i);
  }
  function onSubstance(c: CompRow) {
    const s = substances.find((x) => x.name === c.substance);
    if (s && !c.unit) c.unit = s.canonicalUnit;
  }

  async function load() {
    try {
      [substances, items] = await Promise.all([listSubstances(), listItems()]);
    } catch {
      flash("Couldn't load — check your token.", true);
    }
  }

  function validComp(c: CompRow): boolean {
    const target = c.mode === "substance" ? c.substance : c.childItemId;
    return !!target && c.amount > 0 && !!c.unit.trim();
  }

  async function submit() {
    if (!name.trim()) return;
    const components = comps.filter(validComp).map((c) =>
      c.mode === "substance"
        ? { substance: c.substance, amount: c.amount, unit: c.unit.trim() }
        : { childItemId: c.childItemId, amount: c.amount, unit: c.unit.trim() }
    );
    const serving: NonNullable<CreateItemBody["defaultServing"]> = {};
    if (dispQty != null && Number.isFinite(dispQty)) serving.displayQuantity = dispQty;
    if (dispUnit.trim()) serving.displayUnit = dispUnit.trim();
    if (canQty != null && Number.isFinite(canQty)) serving.canonicalQuantity = canQty;
    if (canUnit.trim()) serving.canonicalUnit = canUnit.trim();

    const body: CreateItemBody = {
      name: name.trim(),
      kind,
      primaryType,
      roles: rolesInput.split(",").map((t) => t.trim()).filter(Boolean),
      notes: notes.trim() || undefined,
      defaultServing: Object.keys(serving).length ? serving : undefined,
      components,
    };

    saving = true;
    try {
      await createItem(body);
      flash("Saved ✓");
      name = "";
      rolesInput = "";
      notes = "";
      comps = [blankComp()];
      await load();
    } catch (e) {
      flash((e as Error).message || "Couldn't save.", true);
    } finally {
      saving = false;
    }
  }

  onMount(load);
</script>

<main class="layout">
  <section class="card">
    <h2>New item</h2>
    <div class="fieldlabel">Name</div>
    <input class="field" placeholder="My Pre-workout, Usual smoothie…" bind:value={name} />

    <div class="row" style="margin-top:8px">
      <div style="flex:1">
        <div class="fieldlabel">Kind</div>
        <select class="field" bind:value={kind}>
          {#each KINDS as k}<option value={k}>{k}</option>{/each}
        </select>
      </div>
      <div style="flex:1">
        <div class="fieldlabel">Type</div>
        <select class="field" bind:value={primaryType}>
          {#each TYPES as t}<option value={t}>{t}</option>{/each}
        </select>
      </div>
    </div>

    <div class="fieldlabel">Roles (optional, comma-separated)</div>
    <input class="field" placeholder="stimulant, hydration…" bind:value={rolesInput} />

    <div class="fieldlabel">Default serving (optional)</div>
    <div class="row">
      <input class="field" type="number" min="0" step="any" placeholder="display qty" bind:value={dispQty} />
      <input class="field" placeholder="display unit (scoop)" bind:value={dispUnit} />
    </div>
    <div class="row" style="margin-top:6px">
      <input class="field" type="number" min="0" step="any" placeholder="canonical qty" bind:value={canQty} />
      <input class="field" placeholder="canonical unit (g)" bind:value={canUnit} />
    </div>

    <div class="fieldlabel">Components</div>
    {#each comps as c, i}
      <div class="comp">
        <div class="row">
          <select class="field" bind:value={c.mode} style="flex:0 0 120px">
            <option value="substance">Substance</option>
            <option value="item">Ingredient</option>
          </select>
          {#if c.mode === "substance"}
            <select class="field" style="flex:1" bind:value={c.substance} onchange={() => onSubstance(c)}>
              <option value="" disabled>Pick a substance…</option>
              {#each substances as s}<option value={s.name}>{s.name}</option>{/each}
            </select>
          {:else}
            <select class="field" style="flex:1" bind:value={c.childItemId}>
              <option value="" disabled>Pick an item…</option>
              {#each items as it}<option value={it.id}>{it.name}</option>{/each}
            </select>
          {/if}
        </div>
        <div class="row" style="margin-top:6px">
          <input class="field" type="number" min="0" step="any" placeholder="amount" bind:value={c.amount} style="flex:1" />
          <input class="field" placeholder="unit" bind:value={c.unit} style="flex:1" />
          <button class="iconbtn" aria-label="Remove component" onclick={() => removeComp(i)}>✕</button>
        </div>
      </div>
    {/each}
    <button class="ghostbtn" onclick={addComp}>+ Add component</button>

    <div class="fieldlabel">Notes (optional)</div>
    <input class="field" bind:value={notes} />

    <button class="primary" disabled={!name.trim() || saving} onclick={submit}>
      {saving ? "Saving…" : "Save item"}
    </button>
  </section>

  <section class="card">
    <h2>Your items</h2>
    {#if items.length}
      {#each items as it}
        <div class="itemrow">
          <span>{it.name}</span>
          <span class="meta">{it.kind} · {it.primaryType}</span>
        </div>
      {/each}
    {:else}
      <p class="mut">No items yet. Create one to log it by name on the Inputs tab.</p>
    {/if}
  </section>
</main>

{#if toast}
  <div class="toast" class:err={toast.err}>{toast.msg}</div>
{/if}
