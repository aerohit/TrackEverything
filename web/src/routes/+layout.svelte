<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";

  let { children } = $props();

  type Pref = "system" | "light" | "dark";
  const ICON: Record<Pref, string> = { system: "◐", light: "☀", dark: "☾" };
  let pref = $state<Pref>("system");

  function effective(p: Pref): "light" | "dark" {
    if (p !== "system") return p;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function apply() {
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
    apply();
  }

  onMount(() => {
    pref = (localStorage.getItem("te_theme") as Pref) ?? "system";
    apply();
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => pref === "system" && apply();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  });
</script>

<header class="appbar">
  <h1>TrackEverything</h1>
  <div class="hbtns">
    <button
      class="iconbtn"
      aria-label="Toggle appearance"
      title={"Appearance: " + pref}
      onclick={cycle}
    >
      {ICON[pref]}
    </button>
  </div>
</header>

<main class="layout">
  {@render children()}
</main>
