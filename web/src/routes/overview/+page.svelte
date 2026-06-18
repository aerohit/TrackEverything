<script lang="ts">
  import { onMount } from "svelte";
  import Chart from "$lib/Chart.svelte";
  import { intakeTotals, listCheckins, listIntake } from "$lib/api";
  import { iconForInput } from "$lib/icons";
  import { type Contribution, groupTotals, substanceContributions } from "$lib/totals";
  import type { Checkin, DailyTotal, IntakeEvent } from "$lib/types";

  let day = $state(startOfToday());
  let checkins = $state<Checkin[]>([]);
  let events = $state<IntakeEvent[]>([]);
  let totals = $state<DailyTotal[]>([]);
  let toast = $state<{ msg: string; err: boolean } | null>(null);
  // Per-substance contribution breakdown popup (which inputs made up a total).
  let breakdown = $state<{ substance: string; amount: number; unit: string; items: Contribution[] } | null>(null);

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
      [checkins, events, totals] = await Promise.all([
        listCheckins({ from, to }),
        listIntake({ from, to }),
        intakeTotals(from, to),
      ]);
    } catch {
      flash("Couldn't load — check your token.", true);
    }
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
                Not resolved yet — its macros/micros aren't counted. (Resolving comes next.)
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

{#if toast}
  <div class="toast" class:err={toast.err}>{toast.msg}</div>
{/if}

<svelte:window onkeydown={(e) => e.key === "Escape" && closeBreakdown()} />
