<script lang="ts">
  import { onMount } from "svelte";
  import Chart from "$lib/Chart.svelte";
  import {
    createItem,
    intakeTotals,
    listCheckins,
    listIntake,
    listSubstances,
    searchItems,
    updateIntake,
  } from "$lib/api";
  import { iconForInput } from "$lib/icons";
  import { type Contribution, groupTotals, substanceContributions } from "$lib/totals";
  import { substanceUnitOptions } from "$lib/units";
  import ItemDraftForm from "$lib/ItemDraftForm.svelte";
  import { draftToBody, emptyDraft, type ItemDraft } from "$lib/itemDraft";
  import type { Checkin, DailyTotal, InputItemSummary, IntakeEvent, Substance } from "$lib/types";

  let day = $state(startOfToday());
  let checkins = $state<Checkin[]>([]);
  let events = $state<IntakeEvent[]>([]);
  let totals = $state<DailyTotal[]>([]);
  let substances = $state<Substance[]>([]);
  let toast = $state<{ msg: string; err: boolean } | null>(null);
  // Per-substance contribution breakdown popup (which inputs made up a total).
  let breakdown = $state<{ substance: string; amount: number; unit: string; items: Contribution[] } | null>(null);

  // Resolve an occasional/unresolved entry (R-CAP-31): link existing / save as item / enter nutrients.
  let resolving = $state<IntakeEvent | null>(null);
  let resolveMode = $state<"link" | "new" | "nutrients">("link");
  let resolveSaving = $state(false);
  let linkQuery = $state("");
  let linkResults = $state<InputItemSummary[]>([]);
  let linkTimer: ReturnType<typeof setTimeout> | undefined;
  let resolveDraft = $state<ItemDraft>(emptyDraft());
  let nutrients = $state<{ substance: string; amount: number; unit: string }[]>([]);

  // Inputs shown in chronological (earliest-first) order; ISO strings sort lexically.
  const ordered = $derived(events.slice().sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)));

  function startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function addDays(d: Date, n: number): Date {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function isToday(d: Date): boolean {
    return d.getTime() === startOfToday().getTime();
  }
  function dayLabel(d: Date): string {
    if (isToday(d)) return "Today";
    if (d.getTime() === addDays(startOfToday(), -1).getTime()) return "Yesterday";
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }
  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function resolvedText(e: IntakeEvent): string {
    return e.resolved.map((r) => `${r.substance} ${r.amount}${r.unit}`).join(" · ");
  }
  // A stack logged as a single entry lists its member items (ADR-030).
  function stackText(e: IntakeEvent): string {
    return e.stackItems.map((m) => `${m.name} ${m.quantity} ${m.unit}`).join(" · ");
  }
  function flash(msg: string, err = false) {
    toast = { msg, err };
    setTimeout(() => (toast = null), 2600);
  }

  function openBreakdown(tot: DailyTotal) {
    breakdown = {
      substance: tot.substance,
      amount: tot.amount,
      unit: tot.unit,
      items: substanceContributions(events, tot.substance),
    };
  }
  function closeBreakdown() {
    breakdown = null;
  }

  async function load() {
    const from = day;
    const to = addDays(day, 1);
    try {
      [checkins, events, totals, substances] = await Promise.all([
        listCheckins({ from, to }),
        listIntake({ from, to }),
        intakeTotals(from, to),
        substances.length ? Promise.resolve(substances) : listSubstances(),
      ]);
    } catch {
      flash("Couldn't load — check your token.", true);
    }
  }

  function openResolve(e: IntakeEvent) {
    resolving = e;
    resolveMode = "link";
    linkQuery = e.displayName;
    linkResults = [];
    resolveDraft = { ...emptyDraft(), name: e.displayName };
    nutrients = [{ substance: "", amount: 1, unit: "g" }];
    runLinkSearch();
  }
  function closeResolve() {
    resolving = null;
  }
  function runLinkSearch() {
    clearTimeout(linkTimer);
    const q = linkQuery.trim();
    linkTimer = setTimeout(async () => {
      linkResults = q ? await searchItems(q).catch(() => []) : [];
    }, 200);
  }
  // (a) Link to an existing item → re-resolve as one serving of it.
  async function resolveLink(item: InputItemSummary) {
    if (!resolving) return;
    resolveSaving = true;
    try {
      await updateIntake(resolving.id, {
        itemId: item.id,
        displayName: item.name,
        quantity: item.defaultDisplayQuantity ?? 1,
        unit: item.defaultDisplayUnit ?? "serving",
        unresolved: false,
      });
      flash(`Resolved as ${item.name} ✓`);
      closeResolve();
      await load();
    } catch (err) {
      flash((err as Error).message || "Couldn't resolve.", true);
    } finally {
      resolveSaving = false;
    }
  }
  // (b) Save it as a new regular item, then link the entry to it.
  async function resolveNew() {
    if (!resolving) return;
    const body = draftToBody(resolveDraft);
    if (!body.name) return;
    resolveSaving = true;
    try {
      const item = await createItem(body);
      await updateIntake(resolving.id, {
        itemId: item.id,
        displayName: body.name,
        quantity: body.defaultServing?.displayQuantity ?? 1,
        unit: body.defaultServing?.displayUnit ?? "serving",
        unresolved: false,
      });
      flash(`Saved & resolved as ${body.name} ✓`);
      closeResolve();
      await load();
    } catch (err) {
      flash((err as Error).message || "Couldn't save item.", true);
    } finally {
      resolveSaving = false;
    }
  }
  // (c) Enter nutrients directly (no item stored) — these become the entry's totals.
  async function resolveNutrients() {
    if (!resolving) return;
    const resolved = nutrients
      .filter((n) => n.substance.trim() && n.amount > 0 && n.unit.trim())
      .map((n) => ({ substance: n.substance.trim(), amount: n.amount, unit: n.unit.trim() }));
    if (!resolved.length) return;
    resolveSaving = true;
    try {
      await updateIntake(resolving.id, { resolved, unresolved: false });
      flash("Resolved ✓");
      closeResolve();
      await load();
    } catch (err) {
      flash((err as Error).message || "Couldn't resolve.", true);
    } finally {
      resolveSaving = false;
    }
  }
  function addNutrient() {
    nutrients = [...nutrients, { substance: "", amount: 1, unit: "g" }];
  }
  function removeNutrient(i: number) {
    nutrients = nutrients.filter((_, idx) => idx !== i);
  }

  function go(delta: number) {
    const next = addDays(day, delta);
    if (next.getTime() > startOfToday().getTime()) return; // no future days
    day = next;
    load();
  }

  onMount(load);
</script>

<main class="layout">
  <div class="daynav">
    <button class="iconbtn" aria-label="Previous day" onclick={() => go(-1)}>‹</button>
    <span class="daylabel">{dayLabel(day)}</span>
    <button class="iconbtn" aria-label="Next day" disabled={isToday(day)} onclick={() => go(1)}>›</button>
  </div>

  <section class="card">
    <h2>Mood · energy · focus</h2>
    <Chart {checkins} />
  </section>

  <div style="display:flex; flex-direction:column; gap:16px">
    <details class="card collapse">
      <summary>Today's Total Macros &amp; Micros</summary>
      {#if totals.length}
        {#each groupTotals(totals) as g}
          <div class="totgroup">{g.label}</div>
          {#each g.items as t}
            <button class="totrow totbtn" onclick={() => openBreakdown(t)}>
              <span>{t.substance}</span><b>{t.amount} {t.unit} ›</b>
            </button>
          {/each}
        {/each}
      {:else}
        <p class="mut">Nothing with a breakdown on this day.</p>
      {/if}
    </details>

    <section class="card">
      <h2>Inputs</h2>
      {#if ordered.length}
        {#each ordered as e}
          <details class="tline">
            <summary>
              <span class="tlicon">{iconForInput(e.displayName)}</span>
              <span class="when">{fmtTime(e.occurredAt)}</span>{e.displayName}
              {#if e.precision === "rough"}<span class="roughtag" title="estimated portion">~</span>{/if}
              {#if e.unresolved}<span class="unresolvedtag" title="no nutrition yet">unresolved</span>{/if}
              <span class="qty">{e.quantity} {e.unit}</span>
            </summary>
            <div class="res">
              {#if e.unresolved}
                <span>Not resolved yet — its macros/micros aren't counted.</span>
                <button class="linklike" onclick={() => openResolve(e)}>Resolve…</button>
              {:else if e.stackItems.length}
                <span class="stacktag">stack</span> {stackText(e)}
              {:else}
                {e.resolved.length ? resolvedText(e) : "no breakdown"}
              {/if}
            </div>
          </details>
        {/each}
      {:else}
        <p class="mut">No inputs logged on this day.</p>
      {/if}
    </section>
  </div>
</main>

{#if breakdown}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={closeBreakdown}>
    <div
      class="modal"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label="Contributions breakdown"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="modal-head">
        <div>
          <div class="modal-title">{breakdown.substance}</div>
          <div class="meta">{breakdown.amount} {breakdown.unit} total · {dayLabel(day)}</div>
        </div>
        <button class="iconbtn" aria-label="Close" onclick={closeBreakdown}>✕</button>
      </div>

      {#if breakdown.items.length}
        {#each breakdown.items as c}
          <div class="totrow"><span>{c.name}</span><b>{c.amount} {c.unit}</b></div>
        {/each}
      {:else}
        <p class="mut">No itemized breakdown for this total.</p>
      {/if}
    </div>
  </div>
{/if}

{#if resolving}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={closeResolve}>
    <div class="modal" role="dialog" tabindex="-1" aria-modal="true" aria-label="Resolve item" onclick={(e) => e.stopPropagation()}>
      <div class="modal-head">
        <div>
          <div class="modal-title">Resolve “{resolving.displayName}”</div>
          <div class="meta">{resolving.quantity} {resolving.unit} · add its nutrition</div>
        </div>
        <button class="iconbtn" aria-label="Close" onclick={closeResolve}>✕</button>
      </div>

      <div class="seg">
        <button class:on={resolveMode === "link"} onclick={() => (resolveMode = "link")}>Existing item</button>
        <button class:on={resolveMode === "new"} onclick={() => (resolveMode = "new")}>Save as item</button>
        <button class:on={resolveMode === "nutrients"} onclick={() => (resolveMode = "nutrients")}>Enter nutrients</button>
      </div>

      {#if resolveMode === "link"}
        <p class="mut" style="margin:6px 0">Match it to one of your items (logs one serving of it).</p>
        <input class="field" placeholder="Search your items…" bind:value={linkQuery} oninput={runLinkSearch} />
        <div style="margin-top:8px">
          {#each linkResults as it}
            <button class="itemrow itembtn" disabled={resolveSaving} onclick={() => resolveLink(it)}>
              <span>{it.name}</span>
              <span class="meta">{it.defaultDisplayQuantity ?? 1} {it.defaultDisplayUnit ?? "serving"} · {it.kind} ›</span>
            </button>
          {:else}
            <p class="mut">No matching items.</p>
          {/each}
        </div>
      {:else if resolveMode === "new"}
        <p class="mut" style="margin:6px 0">Create a reusable item from this; it'll be linked here.</p>
        <ItemDraftForm bind:draft={resolveDraft} {substances} mode="item" />
        <button class="primary" disabled={!resolveDraft.name.trim() || resolveSaving} onclick={resolveNew}>
          {resolveSaving ? "Saving…" : "Save item & resolve"}
        </button>
      {:else}
        <p class="mut" style="margin:6px 0">Enter the nutrition for this entry (totals only — no item saved).</p>
        {#each nutrients as n, i}
          <div class="row" style="margin-top:6px">
            <input class="field" style="flex:2" placeholder="substance" list="rv-substances" bind:value={n.substance} />
            <input class="field" style="flex:1" type="number" min="0" step="any" placeholder="amt" bind:value={n.amount} />
            <select class="field" style="flex:1" aria-label="Nutrient unit" bind:value={n.unit}>
              {#each substanceUnitOptions(n.unit) as u}<option value={u}>{u}</option>{/each}
            </select>
            <button class="iconbtn" aria-label="Remove" onclick={() => removeNutrient(i)}>✕</button>
          </div>
        {/each}
        <datalist id="rv-substances">{#each substances as s}<option value={s.name}></option>{/each}</datalist>
        <button class="ghostbtn" onclick={addNutrient}>+ Add nutrient</button>
        <button class="primary" disabled={resolveSaving} onclick={resolveNutrients}>
          {resolveSaving ? "Saving…" : "Resolve"}
        </button>
      {/if}
    </div>
  </div>
{/if}

{#if toast}
  <div class="toast" class:err={toast.err}>{toast.msg}</div>
{/if}

<svelte:window onkeydown={(e) => e.key === "Escape" && (resolving ? closeResolve() : closeBreakdown())} />
