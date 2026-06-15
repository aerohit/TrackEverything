<script lang="ts">
  import { onMount } from "svelte";
  import Chart from "$lib/Chart.svelte";
  import { intakeTotals, listCheckins, listIntake } from "$lib/api";
  import type { Checkin, DailyTotal, IntakeEvent } from "$lib/types";

  let checkins = $state<Checkin[]>([]);
  let events = $state<IntakeEvent[]>([]);
  let totals = $state<DailyTotal[]>([]);
  let toast = $state<{ msg: string; err: boolean } | null>(null);

  function startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
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
    const from = startOfToday();
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    try {
      [checkins, events, totals] = await Promise.all([
        listCheckins({ from }),
        listIntake({ from, to }),
        intakeTotals(from, to),
      ]);
    } catch {
      flash("Couldn't load today — check your token.", true);
    }
  }

  onMount(load);
</script>

<main class="layout">
  <section class="card">
    <h2>Mood · energy · focus</h2>
    <Chart {checkins} />
  </section>

  <div style="display:flex; flex-direction:column; gap:16px">
    <section class="card">
      <h2>Today's totals</h2>
      {#if totals.length}
        {#each totals as t}
          <div class="totrow"><span>{t.substance}</span><b>{t.amount} {t.unit}</b></div>
        {/each}
      {:else}
        <p class="mut">Nothing with a breakdown yet today.</p>
      {/if}
    </section>

    <section class="card">
      <h2>Today's inputs</h2>
      {#if events.length}
        {#each events as e}
          <details class="tline">
            <summary>
              <span class="when">{fmtTime(e.occurredAt)}</span>{e.displayName}
              <span class="qty">{e.quantity} {e.unit}</span>
            </summary>
            <div class="res">{e.resolved.length ? resolvedText(e) : "no breakdown"}</div>
          </details>
        {/each}
      {:else}
        <p class="mut">No inputs logged yet today.</p>
      {/if}
    </section>
  </div>
</main>

{#if toast}
  <div class="toast" class:err={toast.err}>{toast.msg}</div>
{/if}
