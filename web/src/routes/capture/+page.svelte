<script lang="ts">
  import { onMount } from "svelte";
  import { deleteIntake, favoriteSuggestions, logIntake, quickItems, setQuickLog } from "$lib/api";
  import { iconForInput } from "$lib/icons";
  import { defaultAmountLabel, isStack, quickLogPayload, stackLogPlan } from "$lib/quickcapture";
  import type { FavoriteSuggestion, QuickItem, QuickPreset } from "$lib/types";

  let items = $state<QuickItem[]>([]);
  let suggestions = $state<FavoriteSuggestion[]>([]);
  let pinningId = $state<string | null>(null);
  let loading = $state(true);
  let busyId = $state<string | null>(null);
  // Per-stack member selection (id → set of included member ids) and expand state.
  let included = $state<Record<string, Set<string>>>({});
  let expanded = $state<Record<string, boolean>>({});
  // Toast doubles as the Undo affordance: it holds the just-logged event ids.
  let toast = $state<{ msg: string; eventIds?: string[]; err: boolean } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  function flash(msg: string, opts: { eventIds?: string[]; err?: boolean } = {}) {
    clearTimeout(toastTimer);
    toast = { msg, eventIds: opts.eventIds, err: opts.err ?? false };
    toastTimer = setTimeout(() => (toast = null), 5000);
  }

  async function load() {
    try {
      [items, suggestions] = await Promise.all([quickItems(), favoriteSuggestions()]);
      // Default every stack to "all members included".
      const next: Record<string, Set<string>> = {};
      for (const it of items) {
        if (isStack(it)) next[it.id] = new Set(it.stack.map((m) => m.itemId));
      }
      included = next;
    } catch {
      flash("Couldn't load — check your token.", { err: true });
    } finally {
      loading = false;
    }
  }

  function isIncluded(stackId: string, memberId: string): boolean {
    return included[stackId]?.has(memberId) ?? false;
  }
  function toggleMember(stackId: string, memberId: string) {
    const set = new Set(included[stackId] ?? []);
    if (set.has(memberId)) set.delete(memberId);
    else set.add(memberId);
    included = { ...included, [stackId]: set };
  }
  function toggleExpand(id: string) {
    expanded = { ...expanded, [id]: !expanded[id] };
  }
  function stackCountLabel(it: QuickItem): string {
    const inc = included[it.id]?.size ?? it.stack.length;
    return inc === it.stack.length ? `${it.stack.length} items` : `${inc} of ${it.stack.length} items`;
  }

  async function log(it: QuickItem, preset?: QuickPreset) {
    busyId = it.id;
    try {
      const payloads = isStack(it) ? stackLogPlan(it, included[it.id] ?? new Set()) : [quickLogPayload(it, preset)];
      if (!payloads.length) {
        flash("Nothing selected to log.", { err: true });
        return;
      }
      const ids: string[] = [];
      for (const p of payloads) ids.push((await logIntake(p)).id);
      let amt: string;
      if (isStack(it)) {
        const inc = included[it.id]?.size ?? it.stack.length;
        amt = inc === it.stack.length ? "all" : `${inc} of ${it.stack.length}`;
      } else {
        amt = preset ? preset.label : defaultAmountLabel(it);
      }
      flash(`Logged ${it.name} · ${amt}`, { eventIds: ids });
    } catch {
      flash(`Couldn't log ${it.name}.`, { err: true });
    } finally {
      busyId = null;
    }
  }

  async function undo() {
    const ids = toast?.eventIds;
    if (!ids?.length) return;
    try {
      await Promise.all(ids.map((id) => deleteIntake(id)));
      flash(ids.length > 1 ? `Removed ${ids.length} entries.` : "Removed.");
    } catch {
      flash("Couldn't undo.", { err: true });
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

  onMount(load);
</script>

<main class="layout">
  <section class="card">
    <h2>Quick Capture</h2>
    <p class="mut">Tap a favorite to log it instantly. A stack logs all its items in one tap — expand it
      to skip any today. Pin items from <a href="/manage">Add Item</a>.</p>

    {#if loading}
      <p class="mut">Loading…</p>
    {:else if items.length}
      <div class="qgrid">
        {#each items as it}
          <div class="qcard">
            <button class="qmain" disabled={busyId === it.id} onclick={() => log(it)}>
              <span class="qicon" aria-hidden="true">{iconForInput(it.name)}</span>
              <span class="qname">{it.name}</span>
              <span class="qamt">{isStack(it) ? stackCountLabel(it) : defaultAmountLabel(it)}</span>
            </button>
            {#if isStack(it)}
              <div class="qpresets">
                <button class="qpreset" onclick={() => toggleExpand(it.id)}>
                  {expanded[it.id] ? "Hide" : "Skip items"}
                </button>
              </div>
              {#if expanded[it.id]}
                <div class="stackitems">
                  {#each it.stack as m}
                    <label class="stackitem">
                      <input
                        type="checkbox"
                        checked={isIncluded(it.id, m.itemId)}
                        onchange={() => toggleMember(it.id, m.itemId)}
                      />
                      <span>{m.name}</span>
                      <span class="mut">{m.quantity} {m.unit}</span>
                    </label>
                  {/each}
                </div>
              {/if}
            {:else if it.quickPresets.length}
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
    {#if toast.eventIds?.length}
      <button class="toast-undo" onclick={undo}>Undo</button>
    {/if}
  </div>
{/if}
