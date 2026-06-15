<script lang="ts">
  import { onMount } from "svelte";
  import { createItem, logIntake, recentItems, recognizeIntake } from "$lib/api";
  import type { CreateItemBody, RecentItem } from "$lib/types";

  // Minimal shape of the (still vendor-prefixed) Web Speech API we rely on.
  interface SpeechRec {
    lang: string;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
    onerror: ((e: { error?: string }) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
  }
  type SpeechRecCtor = new () => SpeechRec;

  // One way to log: snap a photo, speak it, or tap a recent item. The current
  // selection is reviewed in a confirm card before it's saved (ADR-020).
  type Target =
    | { kind: "item"; id: string; name: string }
    | { kind: "new" }
    | { kind: "freeform" };

  type Confirm = {
    name: string;
    quantity: number;
    unit: string;
    when: string;
    options: Target[];
    selected: number;
    draft: CreateItemBody | null;
    transcript?: string;
  };

  let busy = $state<string | null>(null); // a status label while an AI call runs
  let listening = $state(false);
  let confirm = $state<Confirm | null>(null);
  let recents = $state<RecentItem[]>([]);
  let saving = $state(false);
  let toast = $state<{ msg: string; err: boolean } | null>(null);
  let speech: SpeechRec | null = null;

  function speechCtor(): SpeechRecCtor | undefined {
    const w = globalThis as unknown as {
      SpeechRecognition?: SpeechRecCtor;
      webkitSpeechRecognition?: SpeechRecCtor;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition;
  }

  function pad(n: number) {
    return String(n).padStart(2, "0");
  }
  function toLocalInput(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${
      pad(d.getMinutes())
    }`;
  }
  function flash(msg: string, err = false) {
    toast = { msg, err };
    setTimeout(() => (toast = null), 3000);
  }
  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve((r.result as string).split(",", 2)[1] ?? "");
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  async function loadRecents() {
    try {
      recents = await recentItems(10);
    } catch {
      recents = [];
    }
  }

  // Turn a recognition result into a confirm card with selectable targets.
  function fromRecognition(
    recognized: { name: string; quantity: number; unit: string; draft: CreateItemBody },
    matches: { id: string; name: string }[],
    transcript?: string,
  ) {
    const options: Target[] = [
      ...matches.map((m) => ({ kind: "item" as const, id: m.id, name: m.name })),
      { kind: "new" },
      { kind: "freeform" },
    ];
    confirm = {
      name: recognized.name,
      quantity: recognized.quantity,
      unit: recognized.unit,
      when: toLocalInput(new Date()),
      options,
      selected: 0, // a match if any, else "save as new"
      draft: recognized.draft,
      transcript,
    };
  }

  async function onPhoto(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = "";
    if (!file) return;
    busy = "Recognizing…";
    try {
      const imageBase64 = await blobToBase64(file);
      const res = await recognizeIntake({ imageBase64, mediaType: file.type || "image/jpeg" });
      fromRecognition(res.recognized, res.matches);
    } catch (err) {
      flash((err as Error).message || "Couldn't read that photo.", true);
    } finally {
      busy = null;
    }
  }

  // Voice = on-device dictation (Web Speech API). The transcript is then sent to
  // the recognizer as text — no audio leaves the browser, no extra API key.
  function toggleVoice() {
    if (listening) {
      speech?.stop();
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) {
      flash("Voice input isn't supported in this browser — try Chrome or Safari.", true);
      return;
    }
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const transcript = Array.from(e.results, (r) => r[0]?.transcript ?? "").join(" ").trim();
      if (transcript) recognizeText(transcript);
      else flash("Didn't catch that — try again.", true);
    };
    rec.onerror = (e) => {
      listening = false;
      if (e.error !== "aborted") {
        flash(e.error === "not-allowed" ? "Allow microphone access to log by voice." : "Voice input failed — try again.", true);
      }
    };
    rec.onend = () => (listening = false);
    speech = rec;
    listening = true;
    rec.start();
  }

  async function recognizeText(transcript: string) {
    busy = "Recognizing…";
    try {
      const res = await recognizeIntake({ text: transcript });
      fromRecognition(res.recognized, res.matches, transcript);
    } catch (err) {
      flash((err as Error).message || "Couldn't make sense of that — try again.", true);
    } finally {
      busy = null;
    }
  }

  function fromRecent(r: RecentItem) {
    const options: Target[] = r.itemId
      ? [{ kind: "item", id: r.itemId, name: r.displayName }, { kind: "freeform" }]
      : [{ kind: "freeform" }];
    confirm = {
      name: r.displayName,
      quantity: r.quantity,
      unit: r.unit,
      when: toLocalInput(new Date()),
      options,
      selected: 0,
      draft: null,
    };
  }

  function optionLabel(t: Target): string {
    if (t.kind === "item") return `Log ${t.name}`;
    if (t.kind === "new") return "Save as a new item";
    return "Just log the name (no breakdown)";
  }

  async function save() {
    if (!confirm || !confirm.name.trim() || !(confirm.quantity > 0)) return;
    const target = confirm.options[confirm.selected];
    saving = true;
    try {
      const base = {
        displayName: confirm.name.trim(),
        quantity: confirm.quantity,
        unit: confirm.unit.trim() || "serving",
        occurredAt: new Date(confirm.when).toISOString(),
      };
      if (target.kind === "item") {
        await logIntake({ ...base, itemId: target.id });
      } else if (target.kind === "new" && confirm.draft) {
        const item = await createItem({ ...confirm.draft, name: confirm.name.trim() });
        await logIntake({ ...base, itemId: item.id });
      } else {
        await logIntake(base);
      }
      flash("Logged ✓");
      confirm = null;
      await loadRecents();
    } catch (err) {
      flash((err as Error).message || "Couldn't log.", true);
    } finally {
      saving = false;
    }
  }

  onMount(loadRecents);
</script>

<section class="card">
  <h2>Log an input</h2>

  {#if !confirm}
    <p class="mut">Snap a photo, say it out loud, or tap something you've logged before.</p>

    <div class="modes">
      <label class="modebtn" class:busy={!!busy}>
        <input type="file" accept="image/*" capture="environment" onchange={onPhoto} disabled={!!busy} />
        <span class="ico">📷</span><span>Photo</span>
      </label>
      <button class="modebtn" class:busy={!!busy} onclick={toggleVoice} disabled={!!busy && !listening}>
        <span class="ico">{listening ? "🔴" : "🎙"}</span>
        <span>{listening ? "Listening…" : "Voice"}</span>
      </button>
    </div>

    {#if busy}
      <p class="mut" aria-live="polite">{busy}</p>
    {/if}

    <div class="fieldlabel">Recent</div>
    {#if recents.length}
      <div class="chips">
        {#each recents as r}
          <button class="chip" onclick={() => fromRecent(r)}>
            {r.displayName}<span class="meta">{r.quantity} {r.unit}</span>
          </button>
        {/each}
      </div>
    {:else}
      <p class="mut">Nothing logged yet — use a photo or your voice to start.</p>
    {/if}
  {:else}
    {#if confirm.transcript}
      <p class="mut">Heard: “{confirm.transcript}”</p>
    {/if}

    <div class="fieldlabel">What</div>
    <input class="field" placeholder="Name" bind:value={confirm.name} />

    <div class="row" style="margin-top:8px">
      <div style="flex:1">
        <div class="fieldlabel">Amount</div>
        <input class="field" type="number" min="0" step="any" bind:value={confirm.quantity} />
      </div>
      <div style="flex:1">
        <div class="fieldlabel">Unit</div>
        <input class="field" placeholder="bowl, cup, g…" bind:value={confirm.unit} />
      </div>
    </div>

    <div class="fieldlabel">When</div>
    <input class="field" type="datetime-local" bind:value={confirm.when} />

    <div class="fieldlabel">Save as</div>
    <div class="opts">
      {#each confirm.options as opt, i}
        <label class="opt" class:sel={confirm.selected === i}>
          <input type="radio" name="target" value={i} bind:group={confirm.selected} />
          <span>{optionLabel(opt)}</span>
        </label>
      {/each}
    </div>

    <div class="row" style="margin-top:12px">
      <button class="ghostbtn" onclick={() => (confirm = null)}>Cancel</button>
      <button
        class="primary"
        style="flex:1"
        disabled={!confirm.name.trim() || !(confirm.quantity > 0) || saving}
        onclick={save}
      >
        {saving ? "Logging…" : "Log"}
      </button>
    </div>
  {/if}
</section>

{#if toast}
  <div class="toast" class:err={toast.err}>{toast.msg}</div>
{/if}
