<script lang="ts">
  import { onMount } from "svelte";
  import { deleteIntake, favoriteSuggestions, logIntake, quickItems, setQuickLog } from "$lib/api";
  import { iconForInput } from "$lib/icons";
  import { defaultAmountLabel, quickLogPayload } from "$lib/quickcapture";
  import type { FavoriteSuggestion, QuickItem, QuickPreset } from "$lib/types";

  let items = $state<QuickItem[]>([]);
  let suggestions = $state<FavoriteSuggestion[]>([]);
  let pinningId = $state<string | null>(null);
  let loading = $state(true);
  let busyId = $state<string | null>(null);
  // Toast doubles as the Undo affordance: it holds the just-logged event id.
  let toast = $state<{ msg: string; eventId?: string; err: boolean } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  function flash(msg: string, opts: { eventId?: string; err?: boolean } = {}) {
    clearTimeout(toastTimer);
    toast = { msg, eventId: opts.eventId, err: opts.err ?? false };
    toastTimer = setTimeout(() => (toast = null), 5000);
  }

  async function load() {
    try {
      [items, suggestions] = await Promise.all([quickItems(), favoriteSuggestions()]);
    } catch {
      flash("Couldn't load — check your token.", { err: true });
    } finally {
      loading = false;
    }
  }

  async function pin(s: FavoriteSuggestion) {
    pinningId = s.id;
    try {
      await setQuickLog(s.id, { quickLog: true });
      flash(`Pinned ${s.name} ✓`);
      await load();
    } catch {
      flash(`Couldn't pin ${s.name}.`, { err: true });
    } finally {
      pinningId = null;
    }
  }

  async function log(item: QuickItem, preset?: QuickPreset) {
    busyId = item.id;
    try {
      const ev = await logIntake(quickLogPayload(item, preset));
      const amt = preset ? preset.label : defaultAmountLabel(item);
      flash(`Logged ${item.name} · ${amt}`, { eventId: ev.id });
    } catch {
      flash(`Couldn't log ${item.name}.`, { err: true });
    } finally {
      busyId = null;
    }
  }

  async function undo() {
    const id = toast?.eventId;
    if (!id) return;
    try {
      await deleteIntake(id);
      flash("Removed.");
    } catch {
      flash("Couldn't undo.", { err: true });
    }
  }

  onMount(load);
</script>

<main class="layout">
  <section class="card">
    <h2>Quick Capture</h2>
    <p class="mut">Tap a favorite to log it instantly. Pick a preset amount, or tap the item for its
      usual amount. Pin items from <a href="/manage">Add Item</a>.</p>

    {#if loading}
      <p class="mut">Loading…</p>
    {:else if items.length}
      <div class="qgrid">
        {#each items as it}
          <div class="qcard">
            <button
              class="qmain"
              disabled={busyId === it.id}
              onclick={() => log(it)}
              title="Log {defaultAmountLabel(it)}"
            >
              <span class="qicon" aria-hidden="true">{iconForInput(it.name)}</span>
              <span class="qname">{it.name}</span>
              <span class="qamt">{defaultAmountLabel(it)}</span>
            </button>
            {#if it.quickPresets.length}
              <div class="qpresets">
                {#each it.quickPresets as p}
                  <button class="qpreset" disabled={busyId === it.id} onclick={() => log(it, p)}>
                    {p.label}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <p class="mut">
        No favorites yet. Open <a href="/manage">Add Item</a>, tap an item, and pin it to Quick
        Capture.
      </p>
    {/if}
  </section>

  {#if suggestions.length}
    <section class="card">
      <h2>You log these a lot</h2>
      <p class="mut">Pin one for one-tap logging.</p>
      {#each suggestions as s}
        <div class="itemrow">
          <span><span class="chipicon" aria-hidden="true">{iconForInput(s.name)}</span> {s.name}</span>
          <button class="ghostbtn" disabled={pinningId === s.id} onclick={() => pin(s)}>
            {pinningId === s.id ? "Pinning…" : `Pin · ${s.count}×`}
          </button>
        </div>
      {/each}
    </section>
  {/if}
</main>

{#if toast}
  <div class="toast" class:err={toast.err}>
    <span>{toast.msg}</span>
    {#if toast.eventId}
      <button class="toast-undo" onclick={undo}>Undo</button>
    {/if}
  </div>
{/if}
