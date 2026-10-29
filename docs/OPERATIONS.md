# Operations: live and local demo

Production uses Vercel for the web, Supabase PostgreSQL/Auth for accounts and retained observations, Upstash for rate limiting/shared cache, and a Render worker. `APP_MODE=demo` uses local SQLite and synthetic observations. These backends are separate; a successful demo does not establish live notification delivery.

## Before a presentation

1. Run `pnpm check:readiness`, `pnpm test`, `pnpm typecheck` and `pnpm build`. Keep private operational output out of public screenshots.
2. Set `TEST_URL=https://price-atlas-ashen.vercel.app` using your shell's environment-variable syntax and run `pnpm test:live-api`. Follow the [teacher checklist](./TEACHER-TEST-CHECKLIST.md), including your own Google consent and Telegram Start flow.
3. Check the worker's last successful tick. The hourly GitHub workflow wakes Render; free hosting and schedules can be delayed. Web health and provider credit balance do not establish fresh product checks.
4. Run `pnpm catalog:snapshot` for a private recorded-catalog snapshot under ignored `data/`. Original observation times are retained. This is supplementary evidence, not a live feed or full database backup.
5. Inspect `/api/v1/catalog/status`. Do not claim 2,500 verified products until its actual count supports that claim. Blocked sources retain retry windows rather than being hammered during a demo.

Stop an owned local server before building into its `.next` directory, then restart it. Do not terminate unrelated processes. Production mutations enforce the configured `APP_ORIGIN`.

## Collection and cost

Name discovery and scheduled collection use free requests only. Search results nominate URLs; primary product pages verify prices. Shared ceilings are 1,000 source requests/day, 100 paid credits/day, 300/month and ten per explicit product verification. Configuration may lower these limits. Provider balance does not override the application budget.

PostgreSQL retains leases, retry windows, budgets and expansion cursors. Bulk unwatched products have a slower cadence; enabled targets have priority. Display freshness is 24 hours; alert freshness is one hour. Unknown shipping qualifies only for an item-price comparison. Missing identity, stock uncertainty and source blocks remain explicit.

Visible browser tabs poll recorded offers at most once per minute without downloading product metadata again. Hidden tabs stop polling and slow requests do not overlap. Telegram polls faster while a connection link is pending. Browser reads do not scrape retailers.

## Accounts and alerts

Google sign-in uses Supabase. Live operator access requires an allowlisted account and MFA (`aal2`). The local demo's `ADMIN_TOKEN` is not a production bypass. Keep service keys and bot/provider tokens server-side, out of Git, screenshots, logs and `NEXT_PUBLIC_*` variables.

Telegram and in-app notifications are the no-domain channels. Email is disabled until a sender domain is verified and `EMAIL_DELIVERY_ENABLED` is enabled. An API key alone cannot make sandbox email reach arbitrary evaluators.

Users connect their own Telegram chat in Settings, open the private short-lived link and press Start. `/stop`, disconnect and account preferences control subsequent delivery. Send tests only to an authorized recipient. `pnpm alerts:test` is an operator-only simulated test, clearly labeled, for a verified account; it must not create fabricated live history. A queued/accepted message is not proof of receipt.

## Recovery and diagnostics

- Use the MFA-protected Operations view for collection runs, quarantine, paused providers and failed job/delivery review. Honor source retry windows.
- For stale offers, check worker ticks, budgets, source blocks and schedules. Do not extend timestamps or import listing-page prices.
- For save failures, inspect the session, origin and response. Blocked browser storage loses local preferences, not server account data.
- Keep backups private. A production restore must reconcile retention expiry, account-deletion tombstones and delivery deduplication before work resumes.

`pnpm backup <new-file.sqlite>` and `pnpm backup:check <file.sqlite>` are **SQLite demo tools only**, not Supabase backups. Inspect restored demo copies at a new `ATLAS_DB_PATH` with collection stopped. A live PostgreSQL restore/reconciliation drill remains a follow-up; application tests do not establish production disaster recovery readiness.

See [status](./STATUS.md), [catalog expansion](./CATALOG-EXPANSION.md) and the [15-perspective audit](./PROJECT-AUDIT.md).
