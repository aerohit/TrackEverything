<script lang="ts">
  import { buildDayChart, seriesOffset } from "$lib/chart";
  import { KINDS } from "$lib/kinds";
  import type { Checkin } from "$lib/types";

  let { checkins }: { checkins: Checkin[] } = $props();

  const W = 320, H = 170, padL = 24, padR = 10, padT = 12, padB = 22;
  const x0 = padL, x1 = W - padR, yb = H - padB, yt = padT;

  const chart = $derived(buildDayChart(checkins, KINDS.map((k) => k.kind)));
  const colorOf = (kind: string) => KINDS.find((k) => k.kind === kind)?.color ?? "var(--accent)";

  // Map a day-fraction into the plot using the chart's (zoomed) time window.
  const xpos = (x: number) =>
    x0 + ((x - chart.domain.min) / (chart.domain.max - chart.domain.min)) * (x1 - x0);
  const ypos = (y: number) => yb + ((y - 1) / 4) * (yt - yb);
  // Fan the three series apart by a few px so equal ratings don't fully overlap.
  const dyOf = (kind: string) => seriesOffset(KINDS.findIndex((k) => k.kind === kind), KINDS.length);
  const poly = (points: { x: number; y: number }[], dy: number) =>
    points.map((p) => `${xpos(p.x).toFixed(1)},${(ypos(p.y) + dy).toFixed(1)}`).join(" ");
</script>

{#if chart.empty}
  <p class="mut">No mood / energy / focus check-ins on this day.</p>
{:else}
  <svg viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="Today's mood, energy and focus">
    {#each [1, 2, 3, 4, 5] as r}
      <line x1={x0} y1={ypos(r)} x2={x1} y2={ypos(r)} class="chartgrid" />
      <text x={x0 - 6} y={ypos(r) + 3} text-anchor="end" font-size="9" class="chartlabel">{r}</text>
    {/each}
    {#each chart.ticks as h}
      <text x={xpos(h / 24)} y={H - 6} text-anchor="middle" font-size="8" class="chartlabel">
        {h}h
      </text>
    {/each}
    {#each chart.series as s}
      {@const dy = dyOf(s.kind)}
      {#if s.points.length > 1}
        <polyline
          points={poly(s.points, dy)}
          fill="none"
          stroke={colorOf(s.kind)}
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      {/if}
      {#each s.points as p}
        <circle
          cx={xpos(p.x)}
          cy={ypos(p.y) + dy}
          r="3"
          fill={colorOf(s.kind)}
          stroke="var(--card)"
          stroke-width="1"
        />
      {/each}
    {/each}
  </svg>
  <div class="legend">
    {#each KINDS as k}
      <span><span class="dot" style="background:{k.color}"></span>{k.label}</span>
    {/each}
  </div>
{/if}
