<script lang="ts">
  import { onMount } from "svelte";
  import Chart from "$lib/Chart.svelte";
  import { intakeTotals, listCheckins, listIntake } from "$lib/api";
  import { iconForInput } from "$lib/icons";
  import { orderTotals } from "$lib/totals";
  import type { Checkin, DailyTotal, IntakeEvent } from "$lib/types";

  let day = $state(startOfToday());
  let checkins = $state<Checkin[]>([]);
  let events = $state<IntakeEvent[]>([]);
  let totals = $state<DailyTotal[]>([]);
  let toast = $state<{ msg: string; err: boolean } | null>(null);

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
  function flash(msg: string, err = false) {
    toast = { msg, err };
    setTimeout(() => (toast = null), 2600);
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
      <summary>Totals</summary>
      {#if totals.length}
        {#each orderTotals(totals) as t}
          <div class="totrow"><span>{t.substance}</span><b>{t.amount} {t.unit}</b></div>
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
              <span class="qty">{e.quantity} {e.unit}</span>
            </summary>
            <div class="res">{e.resolved.length ? resolvedText(e) : "no breakdown"}</div>
          </details>
        {/each}
      {:else}
        <p class="mut">No inputs logged on this day.</p>
      {/if}
    </section>
  </div>
</main>

{#if toast}
  <div class="toast" class:err={toast.err}>{toast.msg}</div>
{/if}
