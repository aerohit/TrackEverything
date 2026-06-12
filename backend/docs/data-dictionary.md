# Data dictionary — event log

Prose companion to the schema in [`migrations/0001_event_log.sql`](../migrations/0001_event_log.sql)
and the controlled vocabularies in [`src/vocab.ts`](../src/vocab.ts) (the code-side source of
truth). Keeps aggregation reliable by fixing names and units (REQUIREMENTS Q4).

## `events` columns

| Column                   | Type        | Meaning                                                                                       |
| ------------------------ | ----------- | --------------------------------------------------------------------------------------------- |
| `id`                     | uuid        | Primary key.                                                                                  |
| `category`               | text        | What kind of thing (see Categories). Validated in the app layer.                              |
| `occurred_at`            | timestamptz | **When it actually happened** (R-CAP-7).                                                      |
| `recorded_at`            | timestamptz | **When it was logged** (defaults to insert time) (R-CAP-7).                                   |
| `occurred_at_confidence` | text        | `high` or `inferred` — `inferred` flags after-the-fact / fuzzy times (R-CAP-12). DB-enforced. |
| `source`                 | text        | Provenance: how the row was created (see Sources) (R-CAP-12).                                 |
| `fields`                 | jsonb       | Category-specific structured data (see Field conventions). Defaults to `{}`.                  |
| `raw_text`               | text        | The original utterance/note, kept verbatim. Nullable.                                         |
| `template_id`            | uuid        | Quick-log template the event came from, if any (Phase 4). Nullable.                           |
| `created_at`             | timestamptz | DB audit timestamp.                                                                           |

## Categories

`food`, `drink`, `supplement`, `sleep`, `workout`, `breathwork`, `mood`, `energy`, `focus`,
`stressor`, `hydration`, `note`.

Mood/energy/focus check-ins (R-SUBJ-1) are ordinary events in these categories with a `rating` field
— no special table.

## Sources

`voice`, `manual`, `quicklog`, `whoop`. New integrations add a source here + in `src/vocab.ts`.

## Field conventions (units)

`fields` is open per category, but use these canonical names + units so values aggregate across
sources:

| Field          | Unit              | Used by                                   |
| -------------- | ----------------- | ----------------------------------------- |
| `caffeine_mg`  | milligrams        | drink, supplement                         |
| `dose_mg`      | milligrams        | supplement                                |
| `servings`     | count (default 1) | supplement (composite products, Phase 4b) |
| `duration_min` | minutes           | workout, breathwork, sleep                |
| `intensity`    | 1–10              | workout                                   |
| `rating`       | 1–5               | mood, energy, focus                       |
| `item`         | string label      | food, drink, supplement                   |

## Reference tables

- **`items`** — personal items / product catalog ("my coffee"; a supplement product). Phase 4b adds
  an `ingredients` table referencing `items` for composite-supplement decomposition.
- **`templates`** — quick-log templates (Phase 4), optionally linked to an item.

## Open questions affecting this dictionary

- **Q5** — ingredient canonicalization & unit normalization (Phase 4b). Start with verbatim
  ingredient name + unit; add a canonical mapping later.
