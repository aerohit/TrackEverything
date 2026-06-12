# Composite supplements — products, label scan, ingredient expansion

Phase 4b. A multi-ingredient supplement (sleep stack, pre-workout) is a **product** — an item with
an ingredient list. You define it once, optionally from a **label photo**; then log it by name.
Analysis works at both levels: the whole product, or decomposed into ingredient amounts
(R-CAP-13/14/15, R-PAT-5, ADR-010).

```
label photo ─▶ POST /ingredient-scan ─▶ {ingredients} ─▶ (confirm/edit) ─▶ POST /products
               Claude vision               unsaved          client UI        item + ingredients

then:  POST /quicklog {product, servings} ─▶ event (item_id set)
       GET  /products?name=X&servings=N  ─▶ product + ingredient amounts
```

## 1. Scan a label — `POST /ingredient-scan`

```
POST /ingredient-scan
Authorization: Bearer <INGEST_TOKEN>

{ "image": "<base64>", "mediaType": "image/jpeg" }   # png/webp/gif also ok
```

Returns `200 {ingredients: [{name, amount, unit}, ...]}` — **not saved**. Needs `ANTHROPIC_API_KEY`
server-side. The model reads the Supplement Facts panel; amounts may be `null` when not printed.

## 2. Create the product — `POST /products`

After the user reviews/edits the ingredients:

```
POST /products
Authorization: Bearer <INGEST_TOKEN>

{
  "name": "sleep stack",
  "category": "supplement",
  "ingredients": [
    { "name": "Magnesium Glycinate", "amount": 200, "unit": "mg" },
    { "name": "L-Theanine", "amount": 100, "unit": "mg" }
  ]
}
```

`201` with the stored product (item + ingredients). `GET /products` lists products;
`GET /products?name=sleep%20stack&servings=2` returns the product plus its ingredients **expanded**
for 2 servings (amounts scaled).

## 3. Log it — `POST /quicklog`

```
POST /quicklog
Authorization: Bearer <INGEST_TOKEN>

{ "product": "sleep stack", "servings": 2 }
```

`201` with the stored event: `category` supplement, `source` quicklog, `fields.servings`, and
**`item_id`** pointing at the product — which is what lets analysis expand the log into ingredient
amounts later.

## Try it with curl

```sh
# scan a label (base64-encode a photo first)
curl -sS -X POST http://localhost:8000/ingredient-scan \
  -H "content-type: application/json" -H "authorization: Bearer $INGEST_TOKEN" \
  -d "{\"image\":\"$(base64 -i label.jpg)\",\"mediaType\":\"image/jpeg\"}"

# create the product (paste edited ingredients), then log it
curl -sS -X POST http://localhost:8000/products  -H "authorization: Bearer $INGEST_TOKEN" \
  -H "content-type: application/json" -d '{"name":"sleep stack","category":"supplement","ingredients":[{"name":"Magnesium Glycinate","amount":200,"unit":"mg"}]}'
curl -sS -X POST http://localhost:8000/quicklog -H "authorization: Bearer $INGEST_TOKEN" \
  -H "content-type: application/json" -d '{"product":"sleep stack","servings":2}'
```

Run locally with `deno task serve:products` and `deno task serve:ingredient-scan`.

## iOS Shortcut

- **Define a product:** **Take Photo** → **Base64 Encode** → POST to `/ingredient-scan` → review →
  POST to `/products`.
- **Log it:** a one-tap Shortcut POSTing `{ "product": "sleep stack" }` to `/quicklog`, exactly like
  the Phase 4 quick-log.

## Notes

- `ingredients.amount` is stored as a number (servings math); `canonical_name` is a simple lowercase
  for now — fuller canonicalization/unit normalization is open question **Q5**, deferred.
- The live vision test needs a real label image: set `ANTHROPIC_API_KEY` and
  `TEST_LABEL_IMAGE=/path/to/label.jpg`, then `deno task test:live`.
