# TrackEverything

A single place to capture everything affecting mood, energy, and focus, then
analyze it for patterns. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md),
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and the gated build plan in
[docs/ROADMAP.md](docs/ROADMAP.md).

## Phased delivery (binding)

Build strictly phase by phase per `docs/ROADMAP.md`. A phase is done only when its
code is written, unit + integration tests pass, and the owner has approved the
acceptance criteria. **Do not begin the next phase until the current one is
approved.** Mark phase status in ROADMAP.md as it progresses.

## Living-docs rule (binding)

These documents (REQUIREMENTS, ARCHITECTURE, ROADMAP) are the source of truth and
MUST stay in sync with the code.
On **any** change that adds, modifies, or removes a feature or design decision,
in the **same change**:

1. **Requirements** — add / edit / retire the relevant `R-*` row in
   `docs/REQUIREMENTS.md`. Never renumber or delete an ID; mark it `Removed`.
   Update the status (`Proposed → Designed → Built → Removed`). Bump `Last updated`
   and add a one-line entry to its Changelog.
2. **Architecture** — update the affected section in `docs/ARCHITECTURE.md` and,
   for any significant or costly-to-reverse decision, add an **ADR**. ADRs are
   append-only and immutable once `Accepted`: to change one, add a new ADR that
   supersedes it and annotate the old one. Bump `Last updated`.
3. **Traceability** — keep requirement IDs referenced from the architecture doc
   accurate. Resolve items in the requirements "Open questions" list into a
   requirement or an ADR rather than leaving them stale.

If a requested change conflicts with an existing requirement or ADR, surface the
conflict before implementing — don't silently diverge from the docs.

At the start of a work session, skim both docs so the work reflects current scope.

## API collection (binding)

[`backend/postman/TrackEverything.postman_collection.json`](backend/postman/TrackEverything.postman_collection.json)
is the source of truth for the HTTP API and MUST stay in sync with the router
([`backend/main.ts`](backend/main.ts)) and the endpoint handlers. On **any** change to the
API — adding/removing/renaming a route, or changing a request method, body shape, query
parameter, header, or auth — update the collection in the **same change**:

1. Add/edit/remove the affected request (folder, example body, and description).
2. A new endpoint needs at least one request whose URL path matches the new route.
3. The drift guard `backend/tests/unit/postman_collection_test.ts` fails CI if a router
   route has no collection request, or the collection references a path the router no longer
   serves — keep it green. (It checks route coverage, not body fields, so still review bodies
   by hand.)
