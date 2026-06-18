<script lang="ts">
  import { onMount } from "svelte";
  import {
    createItem,
    deleteItem,
    getItem,
    listItems,
    listSubstances,
    lookupBarcode,
    scanItem,
    setQuickLog,
  } from "$lib/api";
  import type {
    CreateItemBody,
    InputItemDetail,
    InputItemSummary,
    QuickPreset,
    Substance,
  } from "$lib/types";
  import ItemDraftForm from "$lib/ItemDraftForm.svelte";
  import { draftFromBody, draftToBody, emptyDraft, type ItemDraft } from "$lib/itemDraft";
  import { unitOptions } from "$lib/units";

  // photo + scan state
  let preview = $state<string | null>(null);
  let imageBase64 = $state<string | null>(null);
  let mediaType = $state("");
  let scanning = $state(false);

  // barcode state: the user photographs the barcode; ZXing decodes the still in JS
  // (works on iOS too — WebKit has no BarcodeDetector) → Open Food Facts → draft.
  // A still photo (autofocused, full-res) decodes far more reliably than live video.
  let decodingBarcode = $state(false);

  // editable draft (shown after a scan)
  let hasDraft = $state(false);
  let draft = $state<ItemDraft>(emptyDraft());
  let formMode = $state<"item" | "stack">("item");

  let substances = $state<Substance[]>([]);
  let items = $state<InputItemSummary[]>([]);
  // Regular items vs stacks are listed separately.
  const regularItems = $derived(items.filter((i) => i.kind !== "stack"));
  const stacks = $derived(items.filter((i) => i.kind === "stack"));
  let saving = $state(false);
  let toast = $state<{ msg: string; err: boolean } | null>(null);

  // item-detail popup
  let detail = $state<InputItemDetail | null>(null);
  let detailLoading = $state<string | null>(null); // id being loaded

  function flash(msg: string, err = false) {
    toast = { msg, err };
    setTimeout(() => (toast = null), 3200);
  }

  // Quick Capture editing within the item-detail popup.
  let qPinned = $state(false);
  let qPresets = $state<QuickPreset[]>([]);
  let qSaving = $state(false);

  async function openDetail(it: InputItemSummary) {
    detailLoading = it.id;
    try {
      detail = await getItem(it.id);
      qPinned = detail.quickLog;
      qPresets = detail.quickPresets.map((p) => ({ ...p }));
      confirmingDelete = false;
    } catch {
      flash("Couldn't load that item.", true);
    } finally {
      detailLoading = null;
    }
  }
  function addPreset() {
    const unit = detail?.defaultDisplayUnit ?? "serving";
    qPresets = [...qPresets, { label: "", quantity: 1, unit }];
  }
  function removePreset(i: number) {
    qPresets = qPresets.filter((_, idx) => idx !== i);
  }
  async function saveQuick() {
    if (!detail) return;
    qSaving = true;
    try {
      const presets = qPresets.filter((p) => p.label.trim() && p.quantity > 0 && p.unit.trim());
      await setQuickLog(detail.id, { quickLog: qPinned, presets });
      flash(qPinned ? "Pinned to Quick Capture ✓" : "Removed from Quick Capture ✓");
      closeDetail();
    } catch (e) {
      flash((e as Error).message || "Couldn't update Quick Capture.", true);
    } finally {
      qSaving = false;
    }
  }
  // Two-step delete confirm within the popup (soft delete; past logs keep showing).
  let confirmingDelete = $state(false);
  let deleting = $state(false);
  async function removeItem() {
    if (!detail) return;
    deleting = true;
    try {
      await deleteItem(detail.id);
      flash(`Deleted ${detail.name}. Past logs still show it.`);
      closeDetail();
      await load();
    } catch (e) {
      flash((e as Error).message || "Couldn't delete item.", true);
    } finally {
      deleting = false;
    }
  }
  function closeDetail() {
    detail = null;
    confirmingDelete = false;
  }
  function compLabel(c: { substance: string | null; childItemId: string | null }) {
    return c.substance ?? "linked item";
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

  function newItem() {
    draft = emptyDraft();
    formMode = "item";
    hasDraft = true;
  }
  function newStack() {
    draft = { ...emptyDraft(), kind: "stack", primaryType: "supplement" };
    formMode = "stack";
    hasDraft = true;
  }

  function applyDraft(d: CreateItemBody) {
    draft = draftFromBody(d);
    formMode = "item"; // scan / barcode always produce an item, never a stack
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

  // Look up a barcode (read by the camera) → draft item.
  async function lookup(code: string) {
    const digits = code.replace(/\D/g, "");
    if (!/^\d{8,14}$/.test(digits)) {
      flash("Couldn't read a valid barcode — try again.", true);
      return;
    }
    try {
      applyDraft(await lookupBarcode(digits));
      flash("Found it — review and save ✓");
    } catch (e) {
      const status = (e as { status?: number }).status;
      flash(
        status === 404 ? "No product found for that barcode." : (e as Error).message || "Lookup failed.",
        true,
      );
    }
  }

  // Decode a barcode from a photo the user just took, then look it up.
  async function onBarcodePhoto(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // allow re-taking the same shot
    if (!file) return;
    decodingBarcode = true;
    const url = URL.createObjectURL(file);
    try {
      // Load ZXing on demand (heavy dep, only needed for a barcode scan).
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints);
      const result = await reader.decodeFromImageUrl(url); // throws if no barcode found
      await lookup(result.getText());
    } catch {
      flash("Couldn't read the barcode — retake the photo up close, with the barcode filling the frame.", true);
    } finally {
      URL.revokeObjectURL(url);
      decodingBarcode = false;
    }
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
    formMode = "item";
    if (preview) URL.revokeObjectURL(preview);
    preview = null;
    imageBase64 = null;
    draft = emptyDraft();
  }

  async function save() {
    const body = draftToBody(draft);
    if (!body.name) return;
    saving = true;
    try {
      await createItem(body);
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
    <h2>Create Regular Item</h2>
    <p class="mut">Take or upload a photo of the label, or scan a barcode — the details are
      fetched and shown below for you to correct, then save.</p>

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

    <div class="or"><span>or scan a barcode</span></div>

    <label class="primary bc-photo" class:busy={decodingBarcode}>
      <input type="file" accept="image/*" capture="environment" onchange={onBarcodePhoto} />
      {decodingBarcode ? "Reading barcode…" : "📷 Scan barcode (take a photo)"}
    </label>

    {#if !hasDraft}
      <div class="or"><span>or build it yourself</span></div>
      <button class="primary" onclick={newItem}>✏️ Create regular item manually</button>
    {/if}

    {#if hasDraft && formMode === "item"}
      <div class="fieldlabel" style="margin-top:4px">New regular item</div>
      <ItemDraftForm bind:draft {substances} {items} mode="item" />
      <button class="primary" disabled={!draft.name.trim() || saving} onclick={save}>
        {saving ? "Saving…" : "Save item"}
      </button>
      <button class="linklike" onclick={reset}>Cancel</button>
    {/if}
  </section>

  <section class="card">
    <h2>Your Regular Items</h2>
    {#if regularItems.length}
      {#each regularItems as it}
        <button
          class="itemrow itembtn"
          onclick={() => openDetail(it)}
          disabled={detailLoading === it.id}
        >
          <span>{it.name}</span>
          <span class="meta">
            {detailLoading === it.id ? "Loading…" : `${it.kind} · ${it.primaryType}`} ›
          </span>
        </button>
      {/each}
    {:else}
      <p class="mut">No items yet. Scan a label or create one above.</p>
    {/if}
  </section>

  <section class="card">
    <h2>Your Stacks</h2>
    {#if !hasDraft}
      <button class="primary" onclick={newStack}>🧩 Create stack</button>
    {/if}

    {#if hasDraft && formMode === "stack"}
      <div class="fieldlabel" style="margin-top:4px">New stack</div>
      <ItemDraftForm bind:draft {substances} {items} mode="stack" />
      <button class="primary" disabled={!draft.name.trim() || saving} onclick={save}>
        {saving ? "Saving…" : "Save stack"}
      </button>
      <button class="linklike" onclick={reset}>Cancel</button>
    {/if}

    {#if stacks.length}
      {#each stacks as it}
        <button
          class="itemrow itembtn"
          onclick={() => openDetail(it)}
          disabled={detailLoading === it.id}
        >
          <span>{it.name}</span>
          <span class="meta">
            {detailLoading === it.id ? "Loading…" : `stack · ${it.primaryType}`} ›
          </span>
        </button>
      {/each}
    {:else}
      <p class="mut">No stacks yet. Tap Create stack to build one from your items.</p>
    {/if}
  </section>
</main>

{#if detail}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={closeDetail}>
    <div
      class="modal"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label="Item details"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="modal-head">
        <div>
          <div class="modal-title">{detail.name}</div>
          <div class="meta">
            {detail.kind} · {detail.primaryType}{detail.brand ? ` · ${detail.brand}` : ""}
          </div>
        </div>
        <button class="iconbtn" aria-label="Close" onclick={closeDetail}>✕</button>
      </div>

      {#if detail.defaultDisplayQuantity != null && detail.defaultDisplayUnit}
        <div class="fieldlabel">Serving</div>
        <p class="mut" style="margin:0 0 6px">
          {detail.defaultDisplayQuantity} {detail.defaultDisplayUnit}
        </p>
      {/if}

      <div class="fieldlabel">Ingredients</div>
      {#if detail.components.length}
        {#each detail.components as c}
          <div class="totrow">
            <span>{compLabel(c)}{c.prepState ? ` (${c.prepState})` : ""}</span>
            <b>{c.amount} {c.unit}</b>
          </div>
        {/each}
      {:else}
        <p class="mut">No ingredients recorded for this item.</p>
      {/if}

      {#if detail.notes}
        <div class="fieldlabel">Notes</div>
        <p class="mut" style="margin:0">{detail.notes}</p>
      {/if}

      <div class="fieldlabel" style="margin-top:14px">Quick Capture</div>
      <label class="qpin">
        <input type="checkbox" bind:checked={qPinned} />
        Pin to the Quick Capture screen for one-tap logging
      </label>
      {#if qPinned}
        <p class="mut" style="margin:6px 0 4px">
          Optional amount presets (e.g. 250 / 500 ml). Tapping the item logs its serving;
          presets are extra one-tap amounts.
        </p>
        {#each qPresets as p, i}
          <div class="row" style="margin-top:6px">
            <input class="field" style="flex:2" placeholder="label (e.g. 500 ml)" bind:value={p.label} />
            <input
              class="field"
              style="flex:1"
              type="number"
              min="0"
              step="any"
              placeholder="qty"
              bind:value={p.quantity}
            />
            <select class="field" style="flex:1" aria-label="Preset unit" bind:value={p.unit}>
              {#each unitOptions(p.unit) as u}<option value={u}>{u}</option>{/each}
            </select>
            <button class="iconbtn" aria-label="Remove preset" onclick={() => removePreset(i)}>✕</button>
          </div>
        {/each}
        <button class="ghostbtn" onclick={addPreset}>+ Add preset</button>
      {/if}
      <button class="primary" disabled={qSaving} onclick={saveQuick}>
        {qSaving ? "Saving…" : "Save Quick Capture"}
      </button>

      <div class="danger-zone">
        {#if confirmingDelete}
          <p class="mut" style="margin:0 0 6px">
            Delete <b>{detail.name}</b>? It leaves your items, but past logs that used it stay on the
            timeline.
          </p>
          <div class="row">
            <button class="dangerbtn" disabled={deleting} onclick={removeItem}>
              {deleting ? "Deleting…" : "Delete item"}
            </button>
            <button class="ghostbtn" onclick={() => (confirmingDelete = false)}>Cancel</button>
          </div>
        {:else}
          <button class="linklike danger" onclick={() => (confirmingDelete = true)}>Delete item…</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if toast}
  <div class="toast" class:err={toast.err}>{toast.msg}</div>
{/if}

<svelte:window onkeydown={(e) => e.key === "Escape" && closeDetail()} />
