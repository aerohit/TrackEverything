<script lang="ts">
  import { KINDS } from "$lib/kinds";
  import { createCheckin } from "$lib/api";
  import type { Reading, SubjectiveKind } from "$lib/types";

  let ratings = $state<Record<string, number>>({});
  let note = $state("");
  let saving = $state(false);
  let toast = $state<{ msg: string; err: boolean } | null>(null);

  const chosen = $derived(KINDS.some((k) => ratings[k.kind]));

  function flash(msg: string, err = false) {
    toast = { msg, err };
    setTimeout(() => (toast = null), 2600);
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
    } catch {
      flash("Couldn't save — check your token.", true);
    } finally {
      saving = false;
    }
  }
</script>

<section class="card">
  <h2>How do you feel?</h2>
  {#each KINDS as k}
    <div class="dim">
      <div class="dim-head"><span class="dot" style="background:{k.color}"></span>{k.label}</div>
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

{#if toast}
  <div class="toast" class:err={toast.err}>{toast.msg}</div>
{/if}
