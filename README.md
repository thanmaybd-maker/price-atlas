# PRICE ATLAS

Price Atlas imports Amazon.in and Flipkart product pages, stores observed prices in PostgreSQL, and supports verified Supabase accounts, saved products, target rules, and email/Telegram alert delivery. The public web app is [price-atlas-ashen.vercel.app](https://price-atlas-ashen.vercel.app); its live API health and ten smoke checks are verified.

Start with [live scraper setup](docs/SCRAPING.md), [Telegram activation](docs/TELEGRAM.md), and [verification results](docs/LIVE-VERIFICATION.md). Source policies control history and alert eligibility. The default development policy supports current imports; history and alerts remain disabled until the source policy permits them. Bot credentials alone do not enable source alerts.

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

106 tests cover domain rules, demo persistence, isolated PostgreSQL/RLS, parsers, collection recovery, email tokens and Telegram linking/delivery. Telegram setup uses private bot credentials to register the hosted webhook; it does not send test messages to personal inboxes. Real chat linking and human delivery still need end-to-end verification after cloud bot settings are applied.

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
