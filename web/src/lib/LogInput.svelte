<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    createItem,
    listSubstances,
    logIntake,
    recentItems,
    recognizeIntake,
    searchItems,
  } from "$lib/api";
  import type { CreateItemBody, RecentItem, Substance } from "$lib/types";
  import { unitOptions } from "$lib/units";
  import { type Match, selectedName, servingUnitChoices } from "$lib/log";
  import ItemDraftForm from "$lib/ItemDraftForm.svelte";
  import { draftFromBody, draftToBody, emptyDraft, type ItemDraft } from "$lib/itemDraft";

  // One way to log: snap/upload a photo, speak or type a phrase, or tap a recent
  // item. The result is reviewed in a confirm card before it's saved (ADR-020),
  // where it's matched against existing items so it can attach to one or save anew.

  type Confirm = {
    name: string;
    quantity: number;
    unit: string;
    when: string;
    query: string; // catalog search text
    results: Match[]; // existing items matching the query
    sel: string; // "item:<id>" | "new" | "freeform"
    touched: boolean; // the user manually chose a target (stop auto-selecting a match)
    recognizedName: string; // the transcribed/recent name, used for "new" / freeform
    recognizedUnit: string; // the recognized/recent unit, restored for "new" / freeform
    draft: CreateItemBody | null; // present when recognized (enables "save as new")
    hint?: string; // the spoken/typed phrase, shown for context
  };

  let busy = $state<string | null>(null); // a status label while recognition runs
  let phrasing = $state(false); // the "speak or type" field is open
  let phrase = $state("");
  let phraseEl = $state<HTMLInputElement | null>(null);
  let confirm = $state<Confirm | null>(null);
  let recents = $state<RecentItem[]>([]);
  let substances = $state<Substance[]>([]); // for the "save as a new item" editor
  let newDraft = $state<ItemDraft>(emptyDraft()); // editable item when saving anew
  let saving = $state(false);
  let toast = $state<{ msg: string; err: boolean } | null>(null);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  // Units offered in the confirm card: an item-backed log is constrained to that
  // item's serving / measurement unit; otherwise the full list (R-CAP-20).
  const unitChoices = $derived.by(() => {
    const c = confirm;
    if (!c) return [] as string[];
    const m = c.sel.startsWith("item:") ? c.results.find((r) => "item:" + r.id === c.sel) : null;
    return m ? servingUnitChoices(m) : unitOptions(c.unit);
  });

  function pad(n: number) {
    return String(n).padStart(2, "0");
  }
  function toLocalInput(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${
      pad(d.getMinutes())
    }`;
  }
  function flash(msg: string, err = false) {
    toast = { msg, err };
    setTimeout(() => (toast = null), 3000);
  }
  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve((r.result as string).split(",", 2)[1] ?? "");
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  async function loadRecents() {
    try {
      recents = await recentItems(10);
    } catch {
      recents = [];
    }
  }

  // Open the confirm card and search the catalog for existing items to attach to.
  async function openConfirm(o: {
    name: string;
    quantity: number;
    unit: string;
    draft: CreateItemBody | null;
    hint?: string;
    preferItemId?: string | null;
  }) {
    confirm = {
      name: o.name,
      quantity: o.quantity,
      unit: o.unit,
      when: toLocalInput(new Date()),
      query: o.name,
      results: [],
      sel: o.draft ? "new" : "freeform",
      touched: false,
      recognizedName: o.name,
      recognizedUnit: o.unit,
      draft: o.draft,
      hint: o.hint,
    };
    // Pre-fill the editable "save as a new item" form from the recognized draft.
    newDraft = o.draft ? draftFromBody(o.draft) : emptyDraft();
    await runSearch(o.preferItemId ?? null);
  }

  // Point the confirm at a target and set the display name to match: a matched
  // item logs under the item's own name, not the transcribed text (ADR-020).
  function applySel(c: Confirm, s: string) {
    c.sel = s;
    c.name = selectedName(s, c.results, c.recognizedName);
    if (s.startsWith("item:")) {
      // Constrain the unit to this item's serving / measurement unit (prevents
      // logging e.g. a "2 scoops" supplement in "bowls"). Keep a still-valid unit;
      // otherwise prefer the recognized unit when allowed, else "serving".
      const m = c.results.find((r) => "item:" + r.id === s);
      const choices = servingUnitChoices(m);
      if (!choices.includes(c.unit)) {
        c.unit = choices.includes(c.recognizedUnit) ? c.recognizedUnit : "serving";
      }
    } else {
      c.unit = c.recognizedUnit; // new / freeform → back to the full unit list
    }
  }
  function selectTarget(s: string) {
    if (!confirm) return;
    confirm.touched = true;
    applySel(confirm, s);
  }

  // Look up existing items for the current query; keep a sensible selection.
  async function runSearch(prefer: string | null = null) {
    const c = confirm;
    if (!c) return;
    const q = c.query.trim();
    let results: Match[] = [];
    if (q.length >= 1) {
      try {
        results = (await searchItems(q)).map((i) => ({
          id: i.id,
          name: i.name,
          kind: i.kind,
          unit: i.defaultDisplayUnit,
        }));
      } catch {
        results = [];
      }
    }
    if (prefer && !results.some((r) => r.id === prefer)) {
      results = [{ id: prefer, name: c.recognizedName, unit: c.recognizedUnit }, ...results];
    }
    if (confirm !== c) return; // card closed / replaced while awaiting
    c.results = results;
    const valid = (s: string) =>
      (s === "new" && !!c.draft) || s === "freeform" || results.some((r) => "item:" + r.id === s);
    // A recent item's own item wins; otherwise, until the user picks a target,
    // default to the best catalog match (so a recognized name logs against an
    // existing item rather than silently creating a duplicate).
    if (prefer) {
      c.touched = true;
      applySel(c, "item:" + prefer);
    } else if (!c.touched || !valid(c.sel)) {
      applySel(c, results.length ? "item:" + results[0].id : c.draft ? "new" : "freeform");
    }
  }

  function onQuery() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(), 220);
  }

  async function onPhoto(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    busy = "Looking at your photo…";
    try {
      const imageBase64 = await blobToBase64(file);
      const res = await recognizeIntake({ imageBase64, mediaType: file.type || "image/jpeg" });
      const r = res.recognized;
      await openConfirm({ name: r.name, quantity: r.quantity, unit: r.unit, draft: r.draft });
    } catch (err) {
      flash((err as Error).message || "Couldn't read that photo.", true);
    } finally {
      busy = null;
    }
  }

  // Voice = the phone's own dictation: we open a text field and focus it so the
  // keyboard (with its 🎤 mic) appears; the user dictates or types, then continues.
  async function startPhrase() {
    phrasing = true;
    phrase = "";
    await tick();
    phraseEl?.focus();
  }
  function cancelPhrase() {
    phrasing = false;
    phrase = "";
  }
  async function submitPhrase() {
    const text = phrase.trim();
    if (!text) return;
    busy = "Working it out…";
    try {
      const res = await recognizeIntake({ text });
      const r = res.recognized;
      await openConfirm({ name: r.name, quantity: r.quantity, unit: r.unit, draft: r.draft, hint: text });
      phrasing = false;
      phrase = "";
    } catch (err) {
      flash((err as Error).message || "Couldn't make sense of that — try again.", true);
    } finally {
      busy = null;
    }
  }

  function fromRecent(r: RecentItem) {
    openConfirm({
      name: r.displayName,
      quantity: r.quantity,
      unit: r.unit,
      draft: null,
      preferItemId: r.itemId,
    });
  }

  async function save() {
    if (!confirm || !(confirm.quantity > 0)) return;
    const sel = confirm.sel;
    // When saving a new item, the editable draft's name is authoritative.
    const newItemBody = sel === "new" ? draftToBody(newDraft) : null;
    if (sel === "new" ? !newItemBody?.name : !confirm.name.trim()) return;
    saving = true;
    try {
      const base = {
        quantity: confirm.quantity,
        unit: confirm.unit.trim() || "serving",
        occurredAt: new Date(confirm.when).toISOString(),
      };
      if (sel.startsWith("item:")) {
        await logIntake({ ...base, displayName: confirm.name.trim(), itemId: sel.slice("item:".length) });
      } else if (sel === "new" && newItemBody) {
        // Create the fully-detailed item (serving + ingredients), then log it.
        const item = await createItem(newItemBody);
        await logIntake({ ...base, displayName: newItemBody.name, itemId: item.id });
      } else {
        await logIntake({ ...base, displayName: confirm.name.trim() });
      }
      flash("Logged ✓");
      confirm = null;
      newDraft = emptyDraft();
      await loadRecents();
    } catch (err) {
      flash((err as Error).message || "Couldn't log.", true);
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    loadRecents();
    listSubstances().then((s) => (substances = s)).catch(() => {});
  });
</script>

<section class="card">
  <h2>Log an input</h2>

  {#if !confirm}
    <p class="mut">Take a photo, upload one, say or type it, or tap something you've logged before.</p>

    <div class="modes">
      <label class="modebtn" class:busy={!!busy}>
        <input type="file" accept="image/*" capture="environment" onchange={onPhoto} disabled={!!busy} />
        <span class="ico">📷</span><span>Camera</span>
      </label>
      <label class="modebtn" class:busy={!!busy}>
        <input type="file" accept="image/*" onchange={onPhoto} disabled={!!busy} />
        <span class="ico">🖼️</span><span>Upload</span>
      </label>
      <button class="modebtn" class:busy={!!busy} onclick={startPhrase} disabled={!!busy}>
        <span class="ico">🎙️</span><span>Speak / type</span>
      </button>
    </div>

    {#if phrasing}
      <div class="fieldlabel">Say it or type it</div>
      <input
        class="field"
        bind:this={phraseEl}
        bind:value={phrase}
        placeholder="Tap 🎤 on your keyboard, or type — e.g. “a bowl of oatmeal and a coffee”"
        onkeydown={(e) => e.key === "Enter" && submitPhrase()}
      />
      <div class="row" style="margin-top:8px">
        <button class="ghostbtn" onclick={cancelPhrase}>Cancel</button>
        <button class="primary" style="flex:1" disabled={!phrase.trim() || !!busy} onclick={submitPhrase}>
          Continue
        </button>
      </div>
    {/if}

    {#if busy}
      <p class="mut" aria-live="polite">{busy}</p>
    {/if}

    <div class="fieldlabel">Recent</div>
    {#if recents.length}
      <div class="chips">
        {#each recents as r}
          <button class="chip" onclick={() => fromRecent(r)}>
            {r.displayName}<span class="meta">{r.quantity} {r.unit}</span>
          </button>
        {/each}
      </div>
    {:else}
      <p class="mut">Nothing logged yet — use a photo or your voice to start.</p>
    {/if}
  {:else}
    {#if confirm.hint}
      <p class="mut">Heard: “{confirm.hint}”</p>
    {/if}

    {#if confirm.sel !== "new"}
      <div class="fieldlabel">What</div>
      <input class="field" placeholder="Name" bind:value={confirm.name} />
    {/if}

    <div class="row" style="margin-top:8px">
      <div style="flex:1">
        <div class="fieldlabel">Amount</div>
        <input class="field" type="number" min="0" step="any" bind:value={confirm.quantity} />
      </div>
      <div style="flex:1">
        <div class="fieldlabel">Unit</div>
        <select class="field" bind:value={confirm.unit}>
          {#each unitChoices as u}<option value={u}>{u}</option>{/each}
        </select>
      </div>
    </div>

    <div class="fieldlabel">When</div>
    <input class="field" type="datetime-local" bind:value={confirm.when} />

    <div class="fieldlabel">Save as</div>
    <input
      class="field"
      placeholder="Search your items…"
      bind:value={confirm.query}
      oninput={onQuery}
      autocomplete="off"
    />
    <div class="opts" style="margin-top:6px">
      {#each confirm.results as m}
        <label class="opt" class:sel={confirm.sel === "item:" + m.id}>
          <input
            type="radio"
            name="target"
            checked={confirm.sel === "item:" + m.id}
            onchange={() => selectTarget("item:" + m.id)}
          />
          <span>Log <b>{m.name}</b>{m.kind ? " · " + m.kind : ""}</span>
        </label>
      {/each}
      {#if confirm.draft}
        <label class="opt" class:sel={confirm.sel === "new"}>
          <input type="radio" name="target" checked={confirm.sel === "new"} onchange={() => selectTarget("new")} />
          <span>Save as a new item</span>
        </label>
      {/if}
      <label class="opt" class:sel={confirm.sel === "freeform"}>
        <input
          type="radio"
          name="target"
          checked={confirm.sel === "freeform"}
          onchange={() => selectTarget("freeform")}
        />
        <span>Just log the name (no breakdown)</span>
      </label>
    </div>

    {#if confirm.sel === "new"}
      <div class="fieldlabel" style="margin-top:14px">New item details</div>
      <p class="mut" style="margin:0 0 4px">
        Review the serving size and ingredients (auto-filled from the photo/voice), then save.
      </p>
      <ItemDraftForm bind:draft={newDraft} {substances} />
    {/if}

    <div class="row" style="margin-top:12px">
      <button class="ghostbtn" onclick={() => (confirm = null)}>Cancel</button>
      <button
        class="primary"
        style="flex:1"
        disabled={(confirm.sel === "new" ? !newDraft.name.trim() : !confirm.name.trim()) ||
          !(confirm.quantity > 0) || saving}
        onclick={save}
      >
        {saving ? "Logging…" : confirm.sel === "new" ? "Save new item & log" : "Log"}
      </button>
    </div>
  {/if}
</section>

{#if toast}
  <div class="toast" class:err={toast.err}>{toast.msg}</div>
{/if}
