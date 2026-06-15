<script lang="ts">
  import { onMount } from "svelte";
  import { intakeTotals, listIntake, logIntake, searchItems } from "$lib/api";
  import type { DailyTotal, InputItemSummary, IntakeEvent } from "$lib/types";

  let name = $state("");
  let itemId = $state<string | null>(null);
  let quantity = $state(1);
  let unit = $state("serving");
  let when = $state(toLocalInput(new Date()));
  let tagsInput = $state("");
  let suggestions = $state<InputItemSummary[]>([]);

  let events = $state<IntakeEvent[]>([]);
  let totals = $state<DailyTotal[]>([]);
  let saving = $state(false);
  let toast = $state<{ msg: string; err: boolean } | null>(null);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  function pad(n: number) {
    return String(n).padStart(2, "0");
  }
  function toLocalInput(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function flash(msg: string, err = false) {
    toast = { msg, err };
    setTimeout(() => (toast = null), 2600);
  }

  function onName() {
    itemId = null; // editing the name turns it back into a freeform log
    clearTimeout(searchTimer);
    const q = name.trim();
    if (q.length < 2) {
      suggestions = [];
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        suggestions = await searchItems(q);
      } catch {
        suggestions = [];
      }
    }, 220);
  }

  function pickItem(s: InputItemSummary) {
    itemId = s.id;
    name = s.name;
    unit = s.defaultDisplayUnit ?? "serving";
    quantity = s.defaultDisplayQuantity ?? 1;
    suggestions = [];
  }

  async function load() {
    const from = startOfToday();
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    try {
      [events, totals] = await Promise.all([listIntake({ from, to }), intakeTotals(from, to)]);
    } catch {
      flash("Couldn't load today.", true);
    }
  }

  async function submit() {
    if (!name.trim() || !(quantity > 0)) return;
    saving = true;
    try {
      const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      await logIntake({
        displayName: name.trim(),
        itemId: itemId ?? undefined,
        quantity,
        unit: unit.trim() || "serving",
        occurredAt: new Date(when).toISOString(),
        contextTags: tags.length ? tags : undefined,
      });
      name = "";
      itemId = null;
      tagsInput = "";
      suggestions = [];
      when = toLocalInput(new Date());
      flash("Logged ✓");
      await load();
    } catch {
      flash("Couldn't log — check your token.", true);
    } finally {
      saving = false;
    }
  }

  function resolvedText(e: IntakeEvent): string {
    return e.resolved.map((r) => `${r.substance} ${r.amount}${r.unit}`).join(" · ");
  }

  onMount(load);
</script>

<main class="layout">
  <section class="card">
    <h2>Log an input</h2>
    <div class="fieldlabel">What did you have?</div>
    <input
      class="field"
      placeholder="Coffee, pre-workout, chicken salad…"
      bind:value={name}
      oninput={onName}
      autocomplete="off"
    />
    {#if suggestions.length}
      <div class="suggest">
        {#each suggestions as s}
          <button type="button" onclick={() => pickItem(s)}>
            {s.name}
            <span class="meta">· {s.kind}{s.brand ? " · " + s.brand : ""}</span>
          </button>
        {/each}
      </div>
    {/if}

    <div class="row" style="margin-top:10px">
      <div style="flex:1">
        <div class="fieldlabel">Amount</div>
        <input class="field" type="number" min="0" step="any" bind:value={quantity} />
      </div>
      <div style="flex:1">
        <div class="fieldlabel">Unit</div>
        <input class="field" placeholder="scoop, cup, g…" bind:value={unit} />
      </div>
    </div>

    <div class="fieldlabel">When</div>
    <input class="field" type="datetime-local" bind:value={when} />

    <div class="fieldlabel">Tags (optional, comma-separated)</div>
    <input class="field" placeholder="pre_workout, fasted…" bind:value={tagsInput} />

    <button class="primary" disabled={!name.trim() || !(quantity > 0) || saving} onclick={submit}>
      {saving ? "Logging…" : itemId ? "Log input" : "Log (freeform)"}
    </button>
    {#if !itemId && name.trim()}
      <p class="mut" style="margin:8px 0 0">No saved item matched — logging by name (no breakdown).</p>
    {/if}
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
      <h2>Today</h2>
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
