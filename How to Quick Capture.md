# How to Quick Capture

A living guide to the **Quick Capture** workflow — the fast, "log it in one tap"
way to track. It's a **new screen that lives alongside the old Log screen** while
we build it out; the old Log screen stays until Quick Capture fully replaces it.

> **Status:** v2-C0 + v2-C1 + v2-C2 shipped (one-tap favorites + amount presets,
> auto-suggested favorites, capture provenance, and **stacks with a skip
> checklist**). Later phases (meal modifiers, photo portions, daily
> reconstruction) are under "Coming next"; this doc grows as each lands.

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

### 4. Smaller / larger portions (size scaler)

For a favorite that isn't a stack and has no amount presets (e.g. a meal like
*Chicken salad*), the card shows **½×** and **2×** chips:
- **Tap the card** → logs your normal serving (1×).
- **Tap ½×** → half a serving; **tap 2×** → a double. (It scales the item's
  default serving.)

### 5. Rough estimates & portions (photo / voice)

When you log by **photo** or **voice**, it's an estimate — so the confirm card
shows a **Light / Medium / Large** portion picker that sets a smaller/normal/larger
amount in one tap, and the entry is marked **rough**. On the Overview, rough
entries get a small **`~`** next to them so you can tell estimates from measured
logs at a glance. (Logging by a measured item, a quick favorite, or a barcode is
treated as precise.)

### 6. "Around now you usually log…" (smart suggestions)

The Capture screen watches your routine: if you tend to log something around the
current time of day (e.g. coffee at ~8am), it shows an **"Around now you usually
log"** row at the top with one-tap buttons. It's quiet — just on the screen, no
notifications — and it hides items you've already logged today.

### 7. Logging something you forgot (approximate time)

On the **Log** screen's confirm card (after a photo / voice / recent tap), the
**When** row has quick buttons — **Morning · Noon · Afternoon · Evening ·
Night**. Tap one to set an approximate time today instead of fiddling with the
clock; the entry is saved as low-confidence (shown as "· approx") so you know the
time is a guess.

### 8. Stacks — log a whole routine in one tap

A **stack** is a routine made of several items — e.g. a *Morning Stack* of your
supplements, or a meal of a few foods. Tap it once and the whole thing is logged.

**Create a stack:**
1. Make sure the member items exist first (e.g. *Vitamin D*, *Magnesium*,
   *Omega-3*) — scan/barcode/create each as its own item. (Stacks can only contain
   items, not other stacks.)
2. On **Add Item**, tap **🧩 Create stack** (next to **✏️ Create item**).
3. Give it a name (*Morning Stack*) and a type.
4. Under **Members**, add each item by name (it autocompletes from your items),
   with how much of it the stack contains. Tap **Save stack**.
5. Pin the stack to Quick Capture (same as any favorite — see step 1 above).

**Log a stack — you choose how it's stored:**
- On **Capture**, the stack shows as one card ("Morning Stack · 3 items").
- **Tap it** → logs the whole stack as **one entry**. In the timeline/Overview that
  single entry is tagged *stack* and **lists the items it contained**.
- Tap **Options** to expand. There you can:
  - **untick** anything you skipped today, then
  - tap the card to log the rest as **one entry**, or tap **"Log as separate
    items"** to log **each item as its own entry** (handy if you want them to show
    individually).
- **Undo** removes the whole tap (every entry it created), as usual.

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

- **Per-log ingredient modifier (part of v2-C3, deferred)** — on a saved meal,
  *+ avocado* for one log without editing the recipe. (The size scaler below
  shipped; this part is still to come.)
- **Honest ranges in totals (rest of v2-C4, deferred)** — daily totals showing a
  range ("protein 145–165 g") for rough days, instead of a fake-precise number.
  (Rough flagging + the portion picker below already shipped.)
- **Daily reconstruction (rest of v2-C6, deferred)** — an end-of-day "anything
  missing?" and rebuilding a forgotten day from one spoken sentence. (The fuzzy
  "when" picker below already shipped.)

---

*Maintained alongside the code. See `docs/REQUIREMENTS.md` (R-CAP-12, 22, 23, 28),
`docs/ROADMAP.md` (Capture Seamlessness track), and `docs/ARCHITECTURE.md`
(ADR-027, ADR-028, ADR-029) for the engineering detail.*
