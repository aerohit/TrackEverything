# TrackEverything — dev + ops helpers.
#
# Deploys are git-driven (push a branch → Deno Deploy deploys that environment), so
# there is no "deploy" target here. This file is for local dev and for the ops you
# run against a specific environment's database: migrations, seeds, a psql shell, and
# opening a promotion PR.
#
# Env-targeted targets read connection strings from `secrets/<env>.env` (gitignored;
# see .env.example for the keys). Usage:
#   make dev
#   make migrate ENV=test
#   make seed-products ENV=preprod
#   make promote FROM=test TO=preprod
#   make db-shell ENV=prod

ENV ?= test
ENVFILE := secrets/$(ENV).env
DENO := deno run --allow-env --allow-net --allow-read

.PHONY: help dev migrate seed-products db-shell promote test fmt lint check web-dev web-build

help:
	@grep -E '^[a-z-]+:.*?##' $(MAKEFILE_LIST) | sed 's/:.*##/\t/' | sort

# --- local dev loop ---
dev: ## Run the API + built PWA locally (loads .env + .env.local)
	deno task dev
web-dev: ## Run the SvelteKit dev server
	npm --prefix web run dev
web-build: ## Production-build the PWA
	npm --prefix web run build
test: ## Run server/db/shared tests
	deno task test
fmt: ## Format
	deno task fmt
lint: ## Lint
	deno task lint
check: ## Type-check
	deno task check

# --- per-environment ops (need secrets/<env>.env with DATABASE_URL) ---
guard-env = @test -f $(ENVFILE) || { echo "Missing $(ENVFILE) — create it from .env.example (gitignored)."; exit 1; }

migrate: ## Apply pending migrations to ENV's database
	$(guard-env)
	set -a; . ./$(ENVFILE); set +a; deno task migrate

seed-products: ## Seed/refresh the grocery product catalog in ENV's database
	$(guard-env)
	set -a; . ./$(ENVFILE); set +a; $(DENO) db/scripts/seed_product_catalog.ts --apply

db-shell: ## Open a psql shell on ENV's database
	$(guard-env)
	set -a; . ./$(ENVFILE); set +a; psql "$$DATABASE_URL"

# --- promotion (test → preprod → main); opens a PR you review + merge ---
promote: ## Open a promotion PR: make promote FROM=test TO=preprod
	@test -n "$(FROM)" && test -n "$(TO)" || { echo "Usage: make promote FROM=test TO=preprod"; exit 1; }
	gh pr create --base $(TO) --head $(FROM) \
	  --title "promote $(FROM) → $(TO)" \
	  --body "Promoting $(FROM) into $(TO)."
