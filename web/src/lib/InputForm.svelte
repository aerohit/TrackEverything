<script lang="ts">
  import { logIntake, searchItems } from "$lib/api";
  import type { InputItemSummary } from "$lib/types";

  let name = $state("");
  let itemId = $state<string | null>(null);
  let quantity = $state(1);
  let unit = $state("serving");
  let when = $state(toLocalInput(new Date()));
  let tagsInput = $state("");
  let suggestions = $state<InputItemSummary[]>([]);
  let saving = $state(false);
  let toast = $state<{ msg: string; err: boolean } | null>(null);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  function pad(n: number) {
    return String(n).padStart(2, "0");
  }
  function toLocalInput(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function flash(msg: string, err = false) {
    toast = { msg, err };
    setTimeout(() => (toast = null), 2600);
  }

  function onName() {
    itemId = null;
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
    } catch {
      flash("Couldn't log — check your token.", true);
    } finally {
      saving = false;
    }
  }
</script>

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
          {s.name}<span class="meta">· {s.kind}{s.brand ? " · " + s.brand : ""}</span>
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

{#if toast}
  <div class="toast" class:err={toast.err}>{toast.msg}</div>
{/if}
