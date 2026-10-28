# PRICE ATLAS

Price Atlas supports Amazon.in, Flipkart, Meesho, Croma, Nykaa, iHerb and B&H product adapters, stores observed prices in PostgreSQL, and supports verified Supabase accounts, saved products, target rules, and email/Telegram alert delivery. The public web app is [price-atlas-ashen.vercel.app](https://price-atlas-ashen.vercel.app); its live API health and ten smoke checks are verified.

Start with [live scraper setup](docs/SCRAPING.md), [Telegram activation](docs/TELEGRAM.md), and [verification results](docs/LIVE-VERIFICATION.md). Public signup is supported. Retailer tracking enables 30-day observed history, alerts and exact matching by default; an explicit policy override can disable them. No historical prices are invented.

## Run locally

Requires Node.js 24+ and pnpm 11.19.0. Copy `.env.example` to private `.env`, configure services, and run:

```sh
pnpm install --frozen-lockfile
pnpm migrate
pnpm dev
```

In a second terminal:

```sh
pnpm worker
```

Open <http://127.0.0.1:3000>. Web and worker read the repository's private `.env`. `APP_MODE=live` uses PostgreSQL and verified accounts. `APP_MODE=demo` preserves the separate SQLite synthetic catalog and local profiles; demo data never seeds the live database.

Stop the development server before building into the shared `.next` directory:

```sh
pnpm build
pnpm start
```

## Use the app

Search any product name/model or paste a direct supported retailer product URL. Public live lookup checks retailer search pages, verifies product details and adds successful results to the catalog; it is not limited to seeded products or electronics. Search can find mice, books, kitchen appliances and other product types. Unsupported or blocked pages produce explicit partial/unavailable results. Sign in with verified email or Google to save a product or target. Missing shipping is shown as unknown; bank/exchange discounts do not reduce ranking prices. Separate store listings require decisive variant evidence before matching.

Settings controls email opt-in, Telegram connection, notification preferences, MFA, export, sign-out and account deletion. Telegram links expire after ten minutes and require pressing Start in the bot. Disconnect in Settings or send `/stop` in Telegram. Email's sandbox sender is restricted to supported recipients; Telegram avoids the email-domain requirement, but cannot guarantee delivery.

Operators with an approved account and MFA can review matches, anomalies and uncertain Telegram sends, pause sources, and retry collection jobs. No fabricated source agreement is supplied by the app.

## Checks

```sh
pnpm test
pnpm typecheck
pnpm format:check
pnpm build
pnpm check:services
pnpm test:live-api
pnpm telegram:setup
```

143 tests cover domain rules, demo persistence, isolated PostgreSQL/RLS, parsers, collection recovery, email tokens, Telegram linking/delivery, daily/monthly credit budgeting, custom-product discovery, shared query caching, exact store matching and isolated test alerts. Telegram setup checks the hosted secret before registering the webhook. `pnpm check:readiness` inspects the catalog, hosted API, authentication settings, collection ledger, ScrapingBee balance and Telegram configuration without sending messages.

`pnpm catalog:import` imports curated retailer URLs with source pacing. `pnpm alerts:test <your verified account email> <product ID> [telegram|email|both]` evaluates a simulated drop and uses a separate test delivery outbox. Messages are labelled TEST; real rules, prices and history stay untouched. Run this operator command locally.

The shared daily request limit defaults to 1,000 (`SCRAPER_REQUESTS_PER_DAY`), including free direct fetches. Paid credit reservations remain capped at 100/day and 300/UTC calendar month, shared across web imports and workers. Direct product fetching runs first; search can also use free DuckDuckGo discovery. Only an explicitly requested product URL can fall back to the configured paid provider after free fetching fails. Ordinary name searches and scheduled collection are free only. Explicit single-product URLs may use up to ten paid credits (`LOOKUP_MAX_CREDITS`); backup account attempts share this same cap. Standard ScrapingBee requests without JavaScript cost 1 credit; premium without JavaScript costs 10. No automatic premium escalation is enabled. Set `SCRAPER_DIRECT_FIRST=false` only to explicitly skip the free product-fetch attempt. Successful searches are cached for six hours; unsuccessful searches for two minutes. Regular unwatched listings refresh daily; large-batch imports retain a weekly cadence; enabled targets refresh hourly, subject to budget and retailer availability. Catalog display expires after 24 hours; alerts require observations less than one hour old. Set a target's item-price basis when shipping is unknown. Failed paid parsing still consumes the reserved allowance conservatively.

Use `pnpm catalog:import --discover --limit 40 --credits 100` for bounded expansion from retailer product links. The importer validates same-store destinations, skips recently checked listings, and saves its resumable discovery frontier under ignored `data/`. `--file path/to/urls.json` adds a JSON array of product URLs; `--dry-run` shows planned requests without scraping. Discovery links alone never create products or prices.

The live worker defaults to polling the durable PostgreSQL ledger once per minute (`WORKER_QUEUE=database`), avoiding idle BullMQ traffic on metered Upstash. API rate limiting still uses Redis. Set `WORKER_QUEUE=redis` explicitly for BullMQ. Apply migrations before starting the new release. Worker HTTP health returns 503 until a successful tick and when its last successful tick is over three minutes old.

GitHub Actions checks the existing Render worker hourly and waits for a successful collection tick, resuming it after idle sleep. This default needs no application secrets in GitHub. If a fully independent scheduled collector is preferred, configure the secrets listed in `.github/workflows/collection.yml` and set `ATLAS_SCHEDULE_ENABLED=true`; that replaces the Render wake check. GitHub schedules can be delayed and free hosting does not guarantee continuous uptime. The worker defaults to standard, unrendered scraping even on deployments with a legacy premium setting; enable `WORKER_SCRAPER_PREMIUM_PROXY` or `WORKER_SCRAPER_RENDER_JS` explicitly to change that.

## Code map

| Location                   | Responsibility                                                       |
| -------------------------- | -------------------------------------------------------------------- |
| `apps/web`                 | Next.js pages, verified auth, JSON APIs and signed webhooks          |
| `apps/worker`              | Scheduled live collection, queue recovery and alert dispatch         |
| `packages/domain`          | Integer-paise prices, eligibility, exact matching and alert episodes |
| `packages/database`        | PostgreSQL migrations/RLS and separate SQLite demo backend           |
| `packages/providers`       | Retailer parsing, proxy transports, validation and capabilities      |
| `packages/jobs`            | BullMQ dispatch, persistent leases, quotas and collection retries    |
| `packages/notifications`   | Resend and Telegram delivery, account linking and opt-out            |
| `tests`, `scripts`, `docs` | Verification, operations and setup                                   |

The worker requires continuous hosting for reliable polling. A free Render web service can sleep, even with a health listener. Source permissions, account/provider settings and actual recipient delivery are reported separately from tests and API acceptance. Never commit `.env` or expose server credentials through `NEXT_PUBLIC_*` settings.
