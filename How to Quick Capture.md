# How to Quick Capture

A living guide to the **Quick Capture** workflow — the fast, "log it in one tap"
way to track. It's a **new screen that lives alongside the old Log screen** while
we build it out; the old Log screen stays until Quick Capture fully replaces it.

> **Status:** v2-C0 + v2-C1 shipped (one-tap favorites + amount presets, plus
> auto-suggested favorites and behind-the-scenes capture provenance). Later phases
> (stacks, meal modifiers, photo portions, daily reconstruction) are listed under
> "Coming next" and this doc grows as each lands.

---

## The idea

> **Log now in 1–3 seconds. Add precision later only if you want it.**

You curate a small set of **favorites** (the things you log every day — water,
coffee, your supplements, your usual lunch). On the **Capture** screen they appear
as a grid of buttons. One tap logs the thing. The app figures out the nutrition,
caffeine, etc. in the background — you don't enter grams at the moment of capture.

---

## What works today (v2-C1)

### 1. Pin an item as a favorite

1. Go to the **Add Item** tab.
2. Under **Your items**, tap the item you want (e.g. *Water*, *Morning coffee*).
   The item popup opens.
3. Scroll to the **Quick Capture** section and tick **"Pin to the Quick Capture
   screen for one-tap logging."**
4. *(Optional)* Add **amount presets** — handy for things you drink in different
   sizes. For water you might add:
   - label `250 ml`, qty `250`, unit `ml`
   - label `500 ml`, qty `500`, unit `ml`
   - label `1 L`, qty `1000`, unit `ml`
5. Tap **Save Quick Capture.**

> The item's own **serving** (set when you created/scanned it) is its default
> one-tap amount. Presets are *extra* amounts — you only need them for things that
> vary.

To unpin later: open the item again, untick the box, and Save. (That also clears
its presets.)

### 2. Log from the Capture screen

1. Go to the **Capture** tab.
2. You'll see your favorites as cards, each with an icon, name, and its default
   amount.
3. **Tap the card** → logs the default amount instantly.
   **Tap a preset chip** (e.g. `250 ml`) → logs that amount instead.
4. A confirmation appears at the bottom: *"Logged Water · 250 ml"* with an
   **Undo** button. Tap **Undo** within a few seconds if it was a mistake.

That's it — no forms, no confirm screen. The entry shows up in your timeline and
daily totals like any other log.

### 3. Let the app suggest favorites

You don't have to remember to pin things. When you've logged an item **a few
times** (3+ in the last month) and it isn't pinned yet, the Capture screen shows
a **"You log these a lot"** section at the bottom. Each row has a **Pin · N×**
button (N = how many times you've logged it) — tap it to promote that item
straight into your favorites grid. It then disappears from the suggestions.

> Behind the scenes, every log now also records **how** it was captured (a quick
> tap, a recent re-log, a photo, or voice). You won't see this — it's there so the
> analysis and future smart suggestions can use it.

### Tips
- **Curate ruthlessly.** Quick Capture is for the handful of things you log
  daily. Everything else still lives on the Log screen (voice, photo, barcode,
  search).
- **Set good defaults.** Make each favorite's serving your *usual* amount, so the
  one-tap is right most of the time.
- **Use presets only when needed.** If you always drink the same size, skip
  presets — the single tap is enough.

---

## Coming next (planned, not built yet)

These are the next phases of the Capture Seamlessness track. This doc will be
updated with how-to steps as each ships.

- **Stacks & checklists (v2-C2)** — log a whole routine like *Morning Stack* in
  one tap, with a checklist to skip an item on days you don't take it all.
- **Meal modifiers (v2-C3)** — on a saved meal, tap *Small / Normal / Large* or
  *+ avocado* without editing the recipe.
- **Photo portions + honest ranges (v2-C4)** — for restaurant/photo meals, pick
  *Light / Medium / Large*; totals show ranges ("protein 145–165 g") instead of
  fake-precise numbers.
- **Smart suggestions (v2-C5)** — quiet prompts like *"It's 08:15 — log Morning
  Stack?"* based on your routine.
- **Daily reconstruction (v2-C6)** — an end-of-day "anything missing?" and a way
  to rebuild a forgotten day from one spoken sentence.

---

*Maintained alongside the code. See `docs/REQUIREMENTS.md` (R-CAP-12, 22, 28),
`docs/ROADMAP.md` (Capture Seamlessness track), and `docs/ARCHITECTURE.md`
(ADR-027, ADR-028) for the engineering detail.*
