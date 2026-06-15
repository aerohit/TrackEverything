<script lang="ts">
  import { onMount } from "svelte";
  import { KINDS } from "$lib/kinds";
  import { ApiError, createCheckin, listCheckins } from "$lib/api";
  import Chart from "$lib/Chart.svelte";
  import type { Checkin, Reading, SubjectiveKind } from "$lib/types";

  let token = $state("");
  let tokenInput = $state("");
  let ratings = $state<Record<string, number>>({});
  let note = $state("");
  let checkins = $state<Checkin[]>([]);
  let saving = $state(false);
  let toast = $state<{ msg: string; err: boolean } | null>(null);

  const hasToken = $derived(token.length > 0);
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
    if (!token) return;
    try {
      checkins = await listCheckins({ from: startOfToday() });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        token = "";
        flash("Token rejected — enter it again.", true);
      } else {
        flash("Couldn't load check-ins.", true);
      }
    }
  }

  function saveToken() {
    token = tokenInput.trim();
    localStorage.setItem("te_token", token);
    tokenInput = "";
    load();
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

  onMount(() => {
    token = localStorage.getItem("te_token") ?? "";
    load();
  });
</script>

{#if !hasToken}
  <section class="card">
    <h2>Set your access token</h2>
    <p class="mut">Paste your <code>INGEST_TOKEN</code>. It's stored on this device only.</p>
    <input
      class="field"
      type="password"
      placeholder="INGEST_TOKEN"
      bind:value={tokenInput}
      onkeydown={(e) => e.key === "Enter" && saveToken()}
    />
    <button class="primary" disabled={!tokenInput.trim()} onclick={saveToken}>Save</button>
  </section>
{:else}
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
{/if}

{#if toast}
  <div class="toast" class:err={toast.err}>{toast.msg}</div>
{/if}
