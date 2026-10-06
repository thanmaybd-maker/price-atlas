# PRICE ATLAS

Price Atlas imports Amazon.in and Flipkart product pages, stores observed prices in PostgreSQL, and supports verified Supabase accounts, saved products, target rules, and email/Telegram alert delivery. The public web app is [price-atlas-ashen.vercel.app](https://price-atlas-ashen.vercel.app); its live API health and ten smoke checks are verified.

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

Sign in with verified email or configured Google OAuth. Paste a direct retailer product URL to import a real listing, inspect price components and source attributes, then save a product or target. Missing shipping is shown as unknown; bank/exchange discounts do not reduce ranking prices. Separate store listings require decisive variant evidence before matching.

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

111 tests cover domain rules, demo persistence, isolated PostgreSQL/RLS, parsers, collection recovery, email tokens, Telegram linking/delivery, daily budgeting, exact store matching and isolated test alerts. Telegram setup checks the hosted secret before registering the webhook.

`pnpm catalog:import` imports curated retailer URLs with source pacing. `pnpm alerts:test <your verified account email> <product ID> [telegram|email|both]` evaluates a simulated drop and uses a separate test delivery outbox. Messages are labelled TEST; real rules, prices and history stay untouched. Run this operator command locally.

The shared daily request limit defaults to 40 (`SCRAPER_REQUESTS_PER_DAY`). Unwatched catalog listings refresh daily; enabled targets refresh hourly, subject to that budget and retailer availability. Set a target's item-price basis when shipping is unknown. Premium proxy requests consume provider credits even when parsing cannot use the response.

An optional GitHub Actions collector runs every 15 minutes without relying on a sleeping web service. Add server secrets under repository Settings → Secrets and variables → Actions, then set `ATLAS_SCHEDULE_ENABLED=true`. See `.github/workflows/collection.yml` for required settings. It is disabled until configured; schedules can be delayed.

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
