# Live scraper update

Amazon.in and Flipkart imports now use a separate PostgreSQL catalog, verified Supabase accounts, Redis/BullMQ workers and a Resend email adapter. Start with [live setup](docs/SCRAPING.md) and [verified results](docs/LIVE-VERIFICATION.md). The existing Vercel deployment still requires live environment configuration and redeployment.

# PRICE ATLAS

A working local implementation of the Smart Shopping blueprint: a responsive storefront, exact-variant comparisons, persistent saved products, price targets, recorded synthetic history, in-app notifications, and a separate collection worker.

**Status: functioning synthetic demo, not the completed live release.** No live Amazon or Flipkart prices are fetched. Retailer links, source agreements, email/Google authentication, email delivery, production PostgreSQL/Redis, and public deployment are not connected. The application refuses `APP_MODE=live` to prevent demo data from being served as live data.

## Start locally

Requires Node.js 24+ and pnpm 11.19.0. Run commands from this directory.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

In another terminal:

```sh
pnpm worker
```

Open <http://127.0.0.1:3000>. Both commands bind or operate locally. SQLite creates `data/atlas.sqlite` on first use. The worker records a new synthetic batch every minute. Without the worker, current offers expire after two hours; restarting the worker refreshes them without resetting your account.

For a production **build of the local demo**, stop the development server first:

```sh
pnpm build
pnpm start
```

This remains a demo and is not suitable for a public production launch.

## Try the connected journey

1. Search `Pixel 9`, browse a category, or filter by brand/budget.
2. Open the product, inspect the exact attributes, two source offers, and chart/table.
3. Choose **Set a price target**. Create a demo profile when prompted. Your typed target is preserved.
4. Save a target above the current price to see an immediate qualifying in-app notification.
5. Open **Watchlist** to rename a collection, edit a target, or remove a saved product.
6. Open **Alerts** to pause/resume a target and inspect notification history.
7. Compare up to four products using the card controls. Comparison selection persists in browser storage.
8. Open **Settings** to export owned data, suppress notifications, sign out, change theme, or delete the demo account.
9. Open **Source status** to inspect the synthetic collection ledger.

Profiles use random opaque HttpOnly session cookies and server-side token hashes. They are not email identities. A new browser or a new session after signing out creates a separate profile; there is no identity recovery in demo mode.

## Verification

```sh
pnpm test          # Domain + isolated SQLite integration tests
pnpm typecheck
pnpm format:check
pnpm build
pnpm test:api      # Requires the running web server and fresh demo observations
pnpm backup data/backups/my-backup.sqlite
pnpm backup:check data/backups/my-backup.sqlite
```

See [verification](docs/VERIFICATION.md) for actual results and untested acceptance criteria. Tests use their own temporary database or isolated demo accounts. API smoke accounts are removed by the test's cleanup. They do not touch your browser profile.

## Code map

| Location               | Responsibility                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `apps/web`             | Next.js App Router, responsive views, server-rendered catalog, JSON endpoints                |
| `apps/worker/index.ts` | Minute-based local collection and notification dispatch                                      |
| `packages/domain`      | Integer-paise arithmetic, eligibility, exact matching, alert episodes, URL parsing           |
| `packages/database`    | SQLite schema, seed catalog, persistence, transactions, session ownership, collection ledger |
| `packages/providers`   | Source capabilities, normalized observation validation, fail-closed unconfigured adapter     |
| `tests`                | Business failure-mode and repository tests                                                   |
| `scripts`              | API smoke checks, consistent backup and integrity verification                               |
| `docs`                 | Implementation status, API contract, operating instructions, verification                    |

The current demo repository uses built-in Node SQLite so it can run without external credentials. This intentionally differs from the blueprint's proposed Supabase/PostgreSQL + Drizzle + BullMQ production stack. SQLite is **not** a drop-in backend for Vercel's ephemeral filesystem, and the minute timer is **not** a production distributed scheduler.

## Environment

See `.env.example`. Next reads web environment files from `apps/web/`; the worker uses process environment. For a shared database path, set `ATLAS_DB_PATH` in the shell for both processes. Default path discovery uses the workspace root.

`ADMIN_TOKEN` enables token-protected operator POST endpoints. It must be configured independently on the web process and is not exposed to client JavaScript. Public source status is read-only. Set `APP_ORIGIN` to the exact browser origin if running behind a local proxy. No third-party secrets are required for the demo.

## Live completion

The blueprint's live acceptance criteria are not met by this demo. [Implementation status](docs/STATUS.md) distinguishes working features, engineering work still needed, and external inputs. Do not represent simulated prices, test notifications, or illustrative product art as retailer data.
