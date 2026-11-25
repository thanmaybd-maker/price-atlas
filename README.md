# Price Atlas

Price comparison site for Indian online stores. You search a product (or paste a product link) and it checks Amazon.in, Flipkart, Meesho, Croma, Nykaa, Reliance Digital, Myntra, AJIO, iHerb and B&H, matches the exact same variant across stores and shows where it is cheapest, with GST and delivery included.

Live site: https://price-atlas-ashen.vercel.app

## Features

- search across 10 stores, matching only the exact variant (same model, storage, colour, pack size)
- daily price history that we record ourselves, plus older history from Keepa and the Internet Archive
- price targets: set a price and get an alert on Telegram, Discord or in the app when it drops
- login with email or Google (Supabase Auth), MFA for the admin/operator pages
- foreign stores (iHerb, B&H) show an INR estimate, but they are never mixed into Indian price ranking

## Tech used

- Next.js 16 + React 19 + TypeScript for the website and API (`apps/web`)
- PostgreSQL on Supabase for the live data, SQLite for the offline demo mode
- a background worker (`apps/worker`) that rechecks prices on a schedule and sends alerts
- cheerio to read store pages; TinyFish, Firecrawl and ScrapingBee as fallbacks when a store blocks a normal request
- Gemini API to help find which stores sell a product (its answers are always re-checked against the store page)
- Telegram Bot API, Discord webhooks and Resend for notifications
- Vitest and Playwright for tests, GitHub Actions for CI, Vercel for the site and Render for the worker

## Folders

| Folder                   | What is in it                                               |
| ------------------------ | ----------------------------------------------------------- |
| `apps/web`               | pages, components and the `/api/v1` routes                  |
| `apps/worker`            | scheduled price collection and alert sending                |
| `packages/domain`        | core rules: prices in paise, variant matching, GST, history |
| `packages/database`      | SQL migrations, Postgres and SQLite code                    |
| `packages/providers`     | store parsers and scraping providers                        |
| `packages/jobs`          | collection jobs, credit budgets, rate limits                |
| `packages/notifications` | Telegram, Discord and email                                 |
| `packages/archive`       | Internet Archive (Wayback) history import                   |
| `tests`                  | unit tests (Vitest) and browser tests (Playwright, `e2e/`)  |
| `scripts`                | one-off commands: migrate, backups, imports, checks         |

## Running it

Needs Node 24+ and pnpm 11.

```sh
cp .env.example .env
pnpm install
pnpm dev
```

Open http://127.0.0.1:3000. With `APP_MODE=demo` (the default in `.env.example`) it runs on local SQLite and needs no keys. For live mode fill the Supabase/scraper keys in `.env`, run `pnpm migrate` once, and start the worker in a second terminal with `pnpm worker`.

On Windows you can also just double-click `run-price-atlas.bat`.

## Tests

```sh
pnpm test        # unit tests
pnpm typecheck
pnpm test:e2e    # browser tests
pnpm build
```

Name searches are free. A pasted product link can use paid scraping credits, capped at 10 per lookup and a daily/monthly limit. `.env` is never committed.
