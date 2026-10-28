# Live collection

Public signup is supported. Supabase provides verified accounts and PostgreSQL persistence; the public site uses live mode. Direct HTTP fetches run first, without provider credits. If a product fetch fails, the configured provider is used as a bounded fallback. ScrapingBee standard requests without JavaScript cost one credit per successful request. Premium India requests remain an explicit option at ten credits without JavaScript. Bright Data is also configurable. See [ScrapingBee documentation](https://www.scrapingbee.com/documentation/) for credit costs. Premium tiers are never automatically selected.

Amazon extraction uses primary price containers, title, availability, purchase controls, image metadata and specification rows. Flipkart supports CSS price selectors and a unique primary Product JSON-LD record, including a truncated heading. Script text about unrelated stock does not determine primary availability. Missing prices, delivery charges and variant details are never invented.

Meesho, Croma, Nykaa, iHerb and B&H have validated product-URL and structured-data adapters. Nykaa selected shades/sizes require a matching primary variant payload and matching structured price/SKU; its parent starting price is never substituted. Meesho may publish a listing price before size selection, which is labelled explicitly. Croma's known extra closing brace in JSON-LD is repaired only when removing that final brace yields valid JSON. A page without positive stock/condition evidence cannot enter eligible rankings. B&H is integrated but was blocked in the live checks; an adapter does not guarantee retailer access.

[Croma](https://www.croma.com/shipping-information) and [Nykaa](https://www.nykaa.com/shipping-policy) describe Indian delivery, with product/location restrictions. [iHerb's India policy](https://www.iherb.com/shipping/in) and [B&H's international policy](https://www.bhphotovideo.com/c/find/HelpCenter/International.jsp) describe international service subject to item, carrier and import restrictions. International-source shipping is always unknown until verified for the destination. Original foreign-currency prices are displayed as source metadata and never converted into an INR observation or an assumed delivered total.

## Source capabilities

The default `retail` policy enables search, current prices, 30-day history, target alerts and exact variant matching. It describes retailer-page tracking without claiming a licensed feed agreement. `SOURCE_POLICIES_JSON` can override each source using the schema in `packages/providers/index.ts`. The separate `live` feed mode requires its actual agreement reference; do not fabricate one.

## Product-name and URL lookup

Public searches check existing products and live retailer search pages. If direct retailer search fails, free DuckDuckGo discovery supplies validated retailer links; ordinary name searches do not call paid providers. Selecting a direct product URL permits bounded paid verification. A candidate search price never becomes an observation. The product page must pass identity, title, price and availability checks first. Names and model numbers are normalized, including spaced storage and model prefixes. Product information lookup does not require sign-in; saving and alerts do.

Phones, laptops, tablets, audio and monitors retain category-specific matching. Other products—including books, calculators, kitchen appliances and accessories—can be imported without pretending they are one of those devices. Generic cross-store matching requires identifying attributes including GTIN and pack/variant evidence; unknown fields keep products separate. Successful queries share a six-hour PostgreSQL cache. Negative queries are cached for two minutes and concurrent identical requests share one lookup. No browser automation or new API account is needed for the default free paths. See [alternatives researched](./PROVIDER-ALTERNATIVES.md).

New history starts with successful observations; the application cannot reconstruct uncollected past prices. New catalog observations expire for display after 24 hours, matching daily checks. Their actual observation timestamps remain visible. Alert eligibility separately expires after one hour. Explicit source policy overrides can shorten display validity; existing stored expiry timestamps are not extended. Product metadata is retained with source evidence rather than erased merely because no current offer exists.

Each lookup accepts `store: 'all'` or one supported retailer. Store-specific query caches are separate. Ordinary name searches are free only, including the product detail attempts selected by discovery. Direct product URLs are explicit verification requests and may reserve up to ten credits (`LOOKUP_MAX_CREDITS`), shared by all account attempts for that lookup. At most two relevant product pages per store are attempted within a lookup time budget.

`SCRAPINGBEE_FALLBACK_API_KEYS` configures comma-separated private backups behind the primary `SCRAPINGBEE_API_KEY`. The current account stays preferred while available. Confirmed authentication/credit failures retire that fingerprint; provider network errors, 429 and 5xx responses trigger a one-minute cooldown. Temporary outages allow at most two account attempts. Retailer CAPTCHA, identity and parsing failures do not rotate accounts. All attempts retain the shared 100/day, 300/month and ten-per-request ceilings. Keys are never stored in PostgreSQL or returned to clients. `pnpm check:provider-pool` checks balances without scraping and clears retired state for accounts that have regained credits. These checks do not establish a trial expiry date.

## Collection budget and hosting

`SCRAPER_REQUESTS_PER_DAY` defaults to 1,000 across public imports and scheduled collection, including free requests, enforced transactionally in PostgreSQL. Each source defaults to twelve requests per minute. Migration `005_credit_budget` adds worst-case paid-credit reservations shared across workers and imports: `SCRAPER_CREDITS_PER_DAY=100`, `SCRAPER_CREDITS_PER_MONTH=300`, and `SCRAPER_MAX_CREDITS=10` by default. Calendar limits use UTC and are independent of provider subscription renewal dates. They account for app reservations since migration, not historical provider usage. A zero credit limit stops paid requests while permitting direct fetching. Inspect provider balance with `pnpm check:readiness`. Migration `006_live_search` adds the shared search cache.

Scheduled collection uses direct fetching only. Unwatched listings refresh daily; enabled targets receive hourly checks within budget. Successful refreshes preserve the tracked schedule. Budget exhaustion defers jobs until the next calendar period without incrementing retailer failures; active jobs prevent duplicate scheduling. The worker defaults to database polling to avoid idle Redis queue commands. A free plan cannot guarantee every listing is checked hourly; exhausted allowances leave observations to expire normally.

Run `pnpm migrate`, then `pnpm worker`. The default hourly GitHub workflow requests the existing Render worker's public health endpoint, waking it after idle sleep and checking its last successful tick. This needs no application credentials in GitHub. To use a fully independent collector instead, add the listed secrets and set `ATLAS_SCHEDULE_ENABLED=true`; that job uses `pnpm worker:once`. [GitHub schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) can be delayed, and free Render instances can sleep, so this does not guarantee continuous or instant collection. Worker premium proxy and JavaScript rendering require explicit `WORKER_SCRAPER_PREMIUM_PROXY` and `WORKER_SCRAPER_RENDER_JS` settings.

## Operator commands

```sh
pnpm catalog:import
pnpm catalog:import --discover --limit 40 --credits 100
pnpm check:readiness
pnpm scrape:import <direct retailer URL>
pnpm check:services
pnpm telegram:setup
pnpm alerts:test <your verified account email> <product ID> [telegram|email|both]
```

The catalog importer uses real retailer responses, paces requests and reports failures. It does not populate simulated live prices. Exact category attributes must agree before two stores share a canonical variant; missing or conflicting attributes keep listings separate.

The alert test command runs locally, evaluates a simulated item-price drop and writes a separate test outbox. It respects verified account preferences and the current Telegram connection, labels messages TEST, and never writes live observations or changes saved rules. Ambiguous sends enter review rather than being blindly duplicated.

## Public authentication and alerts

Supabase handles login emails; Resend and Telegram handle price alerts. Configure public Google OAuth rather than testing accounts only. Configure Supabase redirect URLs for the actual deployment.

Resend's `onboarding@resend.dev` sandbox restricts ordinary recipients to the Resend account owner. A verified sender domain is needed for public email delivery. Telegram does not require an email domain; it needs the matching hosted webhook secret, registered webhook, and a user's Connect Telegram → Start action. API acceptance is not proof that a person read a message.

Web and worker secrets belong in private environment settings, never source or `NEXT_PUBLIC_*`. Pasted credentials should be rotated at their providers. Source controls, MFA and owner-scoped data access remain active.
