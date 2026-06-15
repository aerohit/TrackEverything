<script lang="ts">
  import { onMount } from "svelte";
  import { KINDS } from "$lib/kinds";
  import { createCheckin, listCheckins } from "$lib/api";
  import Chart from "$lib/Chart.svelte";
  import type { Checkin, Reading, SubjectiveKind } from "$lib/types";

  let ratings = $state<Record<string, number>>({});
  let note = $state("");
  let checkins = $state<Checkin[]>([]);
  let saving = $state(false);
  let toast = $state<{ msg: string; err: boolean } | null>(null);

  const chosen = $derived(KINDS.some((k) => ratings[k.kind]));

  function flash(msg: string, err = false) {
    toast = { msg, err };
    setTimeout(() => (toast = null), 2600);
  }

  function startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  async function load() {
    try {
      checkins = await listCheckins({ from: startOfToday() });
    } catch {
      flash("Couldn't load check-ins.", true);
    }
  }

  function pick(kind: SubjectiveKind, n: number) {
    ratings[kind] = ratings[kind] === n ? 0 : n;
  }

  async function submit() {
    const readings: Reading[] = KINDS
      .filter((k) => ratings[k.kind])
      .map((k) => ({ kind: k.kind, rating: ratings[k.kind] }));
    if (!readings.length) return;
    saving = true;
    try {
      await createCheckin({ readings, note: note.trim() || undefined });
      ratings = {};
      note = "";
      flash("Checked in ✓");
      await load();
    } catch {
      flash("Couldn't save — check your token.", true);
    } finally {
      saving = false;
    }
  }

  onMount(load);
</script>

<main class="layout">
  <section class="card">
    <h2>How do you feel?</h2>
    {#each KINDS as k}
      <div class="dim">
        <div class="dim-head">
          <span class="dot" style="background:{k.color}"></span>{k.label}
        </div>
        <div class="scale">
          {#each [1, 2, 3, 4, 5] as n}
            <button class:sel={ratings[k.kind] === n} onclick={() => pick(k.kind, n)}>{n}</button>
          {/each}
        </div>
      </div>
    {/each}
    <textarea placeholder="Optional note…" bind:value={note}></textarea>
    <button class="primary" disabled={!chosen || saving} onclick={submit}>
      {saving ? "Saving…" : "Log check-in"}
    </button>
  </section>

  <section class="card">
    <h2>Today</h2>
    <Chart {checkins} />
  </section>
</main>

{#if toast}
  <div class="toast" class:err={toast.err}>{toast.msg}</div>
{/if}
