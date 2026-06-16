<script lang="ts">
  import { askLlm } from "$lib/api";

  // Ask the LLM about everything logged in the last 48h (inputs + feelings). The
  // server gathers the data, builds the prompt, and Claude answers (ADR-023).
  const PRESETS = [
    "Why am I feeling low in energy, mood, or focus?",
    "What can I do to improve my mood, energy, or focus?",
    "Is there something I should be careful with?",
  ];

  let question = $state("");
  let asking = $state(false);
  let answer = $state<string | null>(null);
  let error = $state<string | null>(null);
  let asked = $state(""); // the question the current answer is for

  async function ask(q: string = question) {
    const text = q.trim();
    if (!text || asking) return;
    question = q;
    asking = true;
    answer = null;
    error = null;
    asked = text;
    try {
      answer = await askLlm(text);
    } catch (e) {
      error = (e as Error).message || "Couldn't get an answer.";
    } finally {
      asking = false;
    }
  }
</script>

<main class="layout">
  <section class="card">
    <h2>Ask about your last 48 hours</h2>
    <p class="mut">
      Claude looks at everything you've logged recently — what you took in and how you felt — and
      answers. Pick a question or ask your own.
    </p>

    <div class="chips">
      {#each PRESETS as p}
        <button class="chip" disabled={asking} onclick={() => ask(p)}>{p}</button>
      {/each}
    </div>

    <div class="fieldlabel">Your question</div>
    <textarea
      class="field"
      rows="3"
      placeholder="Ask anything — tap 🎤 on your keyboard to speak, or type…"
      bind:value={question}
      onkeydown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && ask()}
    ></textarea>

    <button class="primary" disabled={!question.trim() || asking} onclick={() => ask()}>
      {asking ? "Thinking…" : "Ask"}
    </button>
  </section>

  {#if asking || answer || error}
    <section class="card">
      {#if asked}<div class="fieldlabel">“{asked}”</div>{/if}
      {#if asking}
        <p class="mut" aria-live="polite">Looking over your last 48 hours…</p>
      {:else if error}
        <p class="mut err-text">{error}</p>
      {:else if answer}
        <div class="answer">{answer}</div>
        <p class="mut" style="margin-top:10px">General wellness reflection, not medical advice.</p>
      {/if}
    </section>
  {/if}
</main>
