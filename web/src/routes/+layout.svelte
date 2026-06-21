<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { page } from "$app/stores";

  let { children } = $props();

  // ---- theme (system-following + toggle) ----
  type Pref = "system" | "light" | "dark";
  const ICON: Record<Pref, string> = { system: "◐", light: "☀", dark: "☾" };
  let pref = $state<Pref>("system");

  function effective(p: Pref): "light" | "dark" {
    if (p !== "system") return p;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function applyTheme() {
    const eff = effective(pref);
    document.documentElement.dataset.theme = eff;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", eff === "dark" ? "#0e0f13" : "#f3f4f7");
  }
  function cycle() {
    const order: Pref[] = ["system", "light", "dark"];
    pref = order[(order.indexOf(pref) + 1) % order.length];
    localStorage.setItem("te_theme", pref);
    applyTheme();
  }

  // ---- access token (shared across screens) ----
  let token = $state("");
  let tokenInput = $state("");
  let showToken = $state(false);

  // ---- deployment environment (from /health) — show a banner outside prod ----
  let appEnv = $state<string | null>(null);
  const envBanner = $derived(appEnv === "test" || appEnv === "preprod");

  function saveToken() {
    token = tokenInput.trim();
    localStorage.setItem("te_token", token);
    tokenInput = "";
    showToken = false;
  }

  const tabs = [
    { href: "/", label: "Log" },
    { href: "/overview", label: "Overview" },
    { href: "/manage", label: "Regular Items" },
    { href: "/ask", label: "Ask LLM" },
  ];
  const path = $derived($page.url.pathname);

  onMount(() => {
    pref = (localStorage.getItem("te_theme") as Pref) ?? "system";
    applyTheme();
    token = localStorage.getItem("te_token") ?? "";
    if (!token) showToken = true;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => pref === "system" && applyTheme();
    mq.addEventListener("change", onChange);
    // Ask the server which environment this is (test/preprod/prod) for the banner.
    fetch("/health").then((r) => r.json()).then((d) => (appEnv = d?.env ?? null)).catch(() => {});
    return () => mq.removeEventListener("change", onChange);
  });
</script>

{#if envBanner}
  <div class="envbanner" data-env={appEnv} role="status">
    {appEnv === "preprod" ? "pre-prod" : "test"} environment — not production
  </div>
{/if}

<header class="appbar">
  <h1>TrackEverything</h1>
  <nav class="topnav">
    {#each tabs as t}
      <a class:active={path === t.href} href={t.href}>{t.label}</a>
    {/each}
  </nav>
  <div class="hbtns">
    <button class="iconbtn" aria-label="Set access token" onclick={() => (showToken = true)}>⚙</button>
    <button class="iconbtn" aria-label="Toggle appearance" title={"Appearance: " + pref} onclick={cycle}>
      {ICON[pref]}
    </button>
  </div>
</header>

{#if !token || showToken}
  <main class="layout">
    <section class="card">
      <h2>Access token</h2>
      <p class="mut">Paste your <code>INGEST_TOKEN</code>. It's stored on this device only.</p>
      <input
        class="field"
        type="password"
        placeholder="INGEST_TOKEN"
        bind:value={tokenInput}
        onkeydown={(e) => e.key === "Enter" && tokenInput.trim() && saveToken()}
      />
      <button class="primary" disabled={!tokenInput.trim()} onclick={saveToken}>Save</button>
      {#if token}
        <button class="ghostbtn" onclick={() => (showToken = false)}>Cancel</button>
      {/if}
    </section>
  </main>
{:else}
  {@render children()}
  <nav class="tabbar">
    {#each tabs as t}
      <a class:active={path === t.href} href={t.href}>{t.label}</a>
    {/each}
  </nav>
{/if}

<style>
  .envbanner {
    position: sticky;
    top: 0;
    z-index: 100;
    padding: 5px 12px;
    text-align: center;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: #3a2a00;
    background: #ffd34d; /* test = amber */
  }
  .envbanner[data-env="preprod"] {
    color: #07263a;
    background: #7cc4ff; /* pre-prod = blue */
  }
</style>
