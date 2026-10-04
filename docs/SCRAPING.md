# Live collection and setup

The local app now runs in live mode. Its PostgreSQL catalog contains real imports, separate from the SQLite demonstration catalog. The existing Vercel deployment was checked and still reports **demo** mode; local `.env` changes do not update Vercel's environment settings.

## Collection choice

Pricewise's [scraper implementation](https://github.com/adrianhajdin/pricewise/tree/main/lib/scraper) separates HTML retrieval, Cheerio extraction, persistence and scheduled refreshes. This app follows that separation with stronger identity, eligibility and retry checks. It does not copy Pricewise's implementation.

| Transport                                                                                             | Use here                                                                           | Validation                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct HTTP with ordinary browser headers                                                             | Development checks; no paid account required                                       | Both retailer examples below returned usable pages during this session. This is not a reliability guarantee.                                   |
| [ScrapingBee HTML API](https://www.scrapingbee.com/documentation/)                                    | Fixed API origin, bearer authentication, explicit JavaScript/premium/India options | Request construction tested with fixtures. No provider key is currently available. Rendering and premium requests have different credit costs. |
| [Bright Data Web Unlocker](https://docs.brightdata.com/products/web-unlocker/send-your-first-request) | Fixed `/request` endpoint, zone, bearer key and raw HTML                           | Request construction tested with fixtures. No provider key/zone is currently available.                                                        |

Start with direct mode for development. Choose a proxy only after testing its India coverage and cost on your catalog. The app never automatically switches into a more expensive tier or provider.

Amazon uses primary price containers and `.a-offscreen`/`.priceToPay` fallbacks, `#productTitle`, explicit availability/purchase controls, selected image metadata and specification rows. Recommendations and struck-out MRP are excluded. Flipkart supports `Nx9bqj`, `_30jeq3`, `VU-ZEz`/older headings and a validated primary Product JSON-LD fallback. The currently observed Flipkart layout needed that structured fallback. Mandatory Protect Promise fees are added separately; conditional bank discounts are not subtracted.

Missing shipping, stock, condition or price is never replaced with an optimistic value. Wrong IDs, conflicting structured/rendered prices, verification pages, unsupported redirects, non-HTML responses and oversized pages fail without saving a guessed price. A confirmed unavailable page clears an older in-stock projection.

## Local commands

```powershell
pnpm migrate
pnpm dev
# In a second terminal, from the same repository:
pnpm worker
```

The worker reads `.env`, schedules due listings in PostgreSQL, dispatches BullMQ jobs over TCP Redis, reserves per-source quotas and retries transient failures. Expired database leases are recovered even when Redis loses a queued job. Upstash currently reports an eviction policy different from BullMQ's recommended `noeviction`; review this in the Redis console before production operation.

```powershell
pnpm scrape:check https://www.amazon.in/dp/B09XS7JWHH
pnpm scrape:import https://www.amazon.in/dp/B09XS7JWHH
pnpm scrape:check https://www.flipkart.com/google-pixel-9-wintergreen-256-gb/p/itmcead5185c21a8
pnpm scrape:import https://www.flipkart.com/google-pixel-9-wintergreen-256-gb/p/itmcead5185c21a8
pnpm check:services
pnpm check:email
pnpm test:live-api
```

These example URLs were validated on 4 October 2026; their prices are observations, not guarantees of current checkout totals. The CLI import command is an operator tool. Browser imports require a verified account and rate limits.

## Accounts and email

1. In Supabase Auth URL Configuration, add the Vercel origin as Site URL, plus `https://price-atlas-ashen.vercel.app/auth/callback` and `http://127.0.0.1:3000/auth/callback` as allowed redirect URLs. Configure Google separately if you want that button to work.
2. Email sign-in uses Supabase's PKCE flow. Open the link in the browser that requested it. Custom email templates using token hashes should target `/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
3. Resend's sandbox sender is `onboarding@resend.dev`. It supports Resend's reserved simulation addresses and restricts ordinary recipients to the account's own email. A verified sending domain is required for other users. `pnpm check:email` sends only to `delivered@resend.dev`, not a personal inbox.
4. Set `EMAIL_LINK_ORIGIN` to the HTTPS deployment URL and keep `UNSUBSCRIBE_SECRET` consistent across web and worker. An unsubscribe link opens a confirmation page; a link scanner cannot unsubscribe someone merely by fetching it.
5. Users explicitly enable email alerts in Settings. Sends recheck the verified destination, preferences, rule version, eligible fresh price and source capability. Stable Resend idempotency keys prevent duplicate retry sends within its [24-hour retention window](https://resend.com/docs/dashboard/emails/idempotency-keys). Older ambiguous sends enter operator review.
6. Configure Resend's signed webhook at `/api/webhooks/resend` and put its signing secret in `RESEND_WEBHOOK_SECRET`. Bounce/complaint events suppress future email.

## Source capabilities

The supplied blueprint requires source rights for historical retention and alerting. A scraper/proxy key is not evidence of those rights. The default development policy displays current imports for one hour with **history and alerts disabled**. No synthetic history is generated in live mode.

Set `SOURCE_POLICIES_JSON` only from actual source permissions. Its shape is an object keyed by `Amazon` and `Flipkart`, with each value matching `capabilitySchema` in `packages/providers/index.ts`: `source`, `mode: "live"`, `version`, `agreementReference`, the nine capability booleans, display TTL, history retention and request quota. Do not invent an agreement reference to switch on alerts. Amazon's [India agreement](https://affiliate-program.amazon.in/help/operating/agreement) specifically addresses price tracking/alert approval for Associates participants.

Two store listings remain separate until decisive category attributes agree. Operators can validate an assignment in `/admin`, approve/reject price anomalies, pause sources and retry failed jobs. Approval cannot override conflicting or missing required identity fields. Set the approved Supabase user UUID in `ADMIN_USER_IDS`, then use Settings → Operator verification to establish MFA.

## Deploy this version

Keep the Vercel project at repository root. Use `pnpm build`; Next's output is root `.next`. Configure Vercel's environment settings with the values from your private `.env`, set `APP_MODE=live`, set `APP_ORIGIN` to the HTTPS Vercel origin, and redeploy. Never commit `.env` or place database/Redis/Resend/service-role secrets in `NEXT_PUBLIC_*` variables.

Run the worker on a long-running Node 24 host/container with `pnpm worker` as its start command and the same server settings. Vercel's web deployment alone does not keep that process running. The Dockerfile can run the worker by overriding its default web command. No worker hosting account or authenticated Vercel CLI is connected to this coding session.

After deployment, `/api/v1/health` must report `mode: "live"`. Test sign-in, an authenticated import, a saved target, scheduled collection, delivery, opt-out and source failure. Do not call the commercial product complete until source permissions, the sending domain, worker hosting and those end-to-end checks are resolved.

The pasted credential attachment includes a database password. Rotate that password in Supabase and update the private environment settings; it has not been copied into source or this document.
