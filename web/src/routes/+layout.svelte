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

  function saveToken() {
    token = tokenInput.trim();
    localStorage.setItem("te_token", token);
    tokenInput = "";
    showToken = false;
  }

  const tabs = [
    { href: "/", label: "Log" },
    { href: "/capture", label: "Capture" },
    { href: "/overview", label: "Overview" },
    { href: "/manage", label: "Add Item" },
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
    return () => mq.removeEventListener("change", onChange);
  });
</script>

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
