<script lang="ts">
  import { onMount } from "svelte";
  import { createItem, listItems, listSubstances, scanItem } from "$lib/api";
  import type { CreateItemBody, InputItemSummary, Substance } from "$lib/types";

  type CompRow = { substance: string; amount: number; unit: string };

  const KINDS = ["product", "recipe", "simple"] as const;
  const TYPES = ["food", "drink", "supplement", "medication", "meal", "other"];

  // photo + scan state
  let preview = $state<string | null>(null);
  let imageBase64 = $state<string | null>(null);
  let mediaType = $state("");
  let scanning = $state(false);

  // editable draft (shown after a scan)
  let hasDraft = $state(false);
  let name = $state("");
  let kind = $state<"product" | "recipe" | "simple">("product");
  let primaryType = $state("supplement");
  let dispQty = $state<number | null>(1);
  let dispUnit = $state("serving");
  let comps = $state<CompRow[]>([]);

  let substances = $state<Substance[]>([]);
  let items = $state<InputItemSummary[]>([]);
  let saving = $state(false);
  let toast = $state<{ msg: string; err: boolean } | null>(null);

  function flash(msg: string, err = false) {
    toast = { msg, err };
    setTimeout(() => (toast = null), 3200);
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve((r.result as string).split(",", 2)[1] ?? "");
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  async function onFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // allow re-picking the same file (and keep both inputs independent)
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    preview = URL.createObjectURL(file);
    mediaType = file.type || "image/jpeg";
    imageBase64 = await fileToBase64(file);
  }

  function applyDraft(d: CreateItemBody) {
    name = d.name ?? "";
    kind = d.kind ?? "product";
    primaryType = d.primaryType ?? "supplement";
    dispQty = d.defaultServing?.displayQuantity ?? 1;
    dispUnit = d.defaultServing?.displayUnit ?? "serving";
    comps = (d.components ?? [])
      .filter((c) => c.substance)
      .map((c) => ({ substance: c.substance as string, amount: c.amount, unit: c.unit }));
    hasDraft = true;
  }

  async function scan() {
    if (!imageBase64) return;
    scanning = true;
    try {
      applyDraft(await scanItem(imageBase64, mediaType));
      flash("Scanned — review and save ✓");
    } catch (e) {
      // Still let the user fill it in by hand.
      applyDraft({ name: "", kind: "product", primaryType: "supplement", components: [] });
      flash((e as Error).message || "Scan failed — enter it manually.", true);
    } finally {
      scanning = false;
    }
  }

  function addComp() {
    comps = [...comps, { substance: "", amount: 1, unit: "mg" }];
  }
  function removeComp(i: number) {
    comps = comps.filter((_, idx) => idx !== i);
  }

  async function load() {
    try {
      [substances, items] = await Promise.all([listSubstances(), listItems()]);
    } catch {
      flash("Couldn't load — check your token.", true);
    }
  }

  function reset() {
    hasDraft = false;
    if (preview) URL.revokeObjectURL(preview);
    preview = null;
    imageBase64 = null;
    name = "";
    comps = [];
  }

  async function save() {
    if (!name.trim()) return;
    const components = comps
      .filter((c) => c.substance.trim() && c.amount > 0 && c.unit.trim())
      .map((c) => ({ substance: c.substance.trim(), amount: c.amount, unit: c.unit.trim() }));
    const serving: NonNullable<CreateItemBody["defaultServing"]> = {};
    if (dispQty != null && Number.isFinite(dispQty)) serving.displayQuantity = dispQty;
    if (dispUnit.trim()) serving.displayUnit = dispUnit.trim();

    saving = true;
    try {
      await createItem({
        name: name.trim(),
        kind,
        primaryType,
        defaultServing: Object.keys(serving).length ? serving : undefined,
        components,
      });
      flash("Saved ✓");
      reset();
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
    <h2>Add item</h2>
    <p class="mut">Take or upload a photo of the label — the ingredients are scanned and shown
      below for you to correct, then save.</p>

    <div class="modes">
      <label class="modebtn">
        <input type="file" accept="image/*" capture="environment" onchange={onFile} />
        <span class="ico">📷</span><span>Camera</span>
      </label>
      <label class="modebtn">
        <input type="file" accept="image/*" onchange={onFile} />
        <span class="ico">🖼️</span><span>Upload</span>
      </label>
    </div>

    {#if preview}
      <div class="photo-pick"><img src={preview} alt="label preview" /></div>
    {/if}

    <button class="primary" disabled={!imageBase64 || scanning} onclick={scan}>
      {scanning ? "Scanning…" : "Scan label"}
    </button>

    {#if hasDraft}
      <div class="fieldlabel">Name</div>
      <input class="field" placeholder="Item name" bind:value={name} />

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

      <div class="fieldlabel">Serving</div>
      <div class="row">
        <input class="field" type="number" min="0" step="any" placeholder="qty" bind:value={dispQty} />
        <input class="field" placeholder="unit (scoop, tablet…)" bind:value={dispUnit} />
      </div>

      <div class="fieldlabel">Ingredients</div>
      {#each comps as c, i}
        <div class="row" style="margin-top:6px">
          <input class="field" style="flex:2" placeholder="substance" list="substances" bind:value={c.substance} />
          <input class="field" style="flex:1" type="number" min="0" step="any" placeholder="amt" bind:value={c.amount} />
          <input class="field" style="flex:1" placeholder="unit" bind:value={c.unit} />
          <button class="iconbtn" aria-label="Remove ingredient" onclick={() => removeComp(i)}>✕</button>
        </div>
      {/each}
      <datalist id="substances">
        {#each substances as s}<option value={s.name}></option>{/each}
      </datalist>
      <button class="ghostbtn" onclick={addComp}>+ Add ingredient</button>

      <button class="primary" disabled={!name.trim() || saving} onclick={save}>
        {saving ? "Saving…" : "Save item"}
      </button>
    {/if}
  </section>

  <section class="card">
    <h2>Your items</h2>
    {#if items.length}
      {#each items as it}
        <div class="itemrow"><span>{it.name}</span><span class="meta">{it.kind} · {it.primaryType}</span></div>
      {/each}
    {:else}
      <p class="mut">No items yet. Scan a label to add one.</p>
    {/if}
  </section>
</main>

{#if toast}
  <div class="toast" class:err={toast.err}>{toast.msg}</div>
{/if}
