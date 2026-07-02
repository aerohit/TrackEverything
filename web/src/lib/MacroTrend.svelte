<script lang="ts">
  // Small-multiples macro trend: one mini bar-chart per macro (each scaled to its own
  // max, since kcal and grams aren't comparable), sharing a single day axis below.
  let { series, dayLabels }: {
    series: { label: string; unit: string; color: string; values: number[] }[];
    dayLabels: string[];
  } = $props();

  const hasData = $derived(series.some((s) => s.values.some((v) => v > 0)));
  const round = (v: number) => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
  const avg = (vs: number[]) => (vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0);
</script>

{#if !hasData}
  <p class="mut">No macros logged in the last 7 days.</p>
{:else}
  <div class="mtrend">
    {#each series as s}
      {@const max = Math.max(1, ...s.values)}
      <div class="mt-row">
        <div class="mt-name"><span class="mt-dot" style="background:{s.color}"></span>{s.label}</div>
        <div class="mt-bars" role="img" aria-label="{s.label}, last 7 days">
          {#each s.values as v, i}
            <div class="mt-cell" title="{dayLabels[i]}: {round(v)} {s.unit}">
              <div
                class="mt-bar"
                class:current={i === s.values.length - 1}
                style="height:{Math.round((v / max) * 100)}%; background:{s.color}"
              ></div>
            </div>
          {/each}
        </div>
        <div class="mt-avg">{round(avg(s.values))}<span class="mt-unit"> {s.unit}/d</span></div>
      </div>
    {/each}
    <div class="mt-axis">
      <div class="mt-name"></div>
      <div class="mt-bars">
        {#each dayLabels as d}<span class="mt-day">{d}</span>{/each}
      </div>
      <div class="mt-avg"><span class="mt-unit">avg</span></div>
    </div>
  </div>
{/if}

<style>
  .mtrend {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .mt-row,
  .mt-axis {
    display: grid;
    grid-template-columns: 78px 1fr 66px;
    align-items: center;
    gap: 10px;
  }
  .mt-name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--fg);
  }
  .mt-dot {
    width: 9px;
    height: 9px;
    border-radius: 3px;
    flex: none;
  }
  .mt-bars {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    height: 38px;
  }
  .mt-cell {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: flex-end;
  }
  .mt-bar {
    width: 100%;
    min-height: 2px;
    border-radius: 3px 3px 0 0;
    opacity: 0.55;
  }
  .mt-bar.current {
    opacity: 1;
  }
  .mt-avg {
    text-align: right;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: var(--fg);
  }
  .mt-unit {
    color: var(--mut);
    font-size: 11px;
  }
  .mt-axis .mt-bars {
    height: auto;
  }
  .mt-day {
    flex: 1;
    text-align: center;
    font-size: 10px;
    color: var(--mut);
  }
</style>
