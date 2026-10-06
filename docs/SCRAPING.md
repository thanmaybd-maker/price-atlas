# Live collection

Public signup is supported. Supabase provides verified accounts and PostgreSQL persistence; the public site uses live mode. ScrapingBee premium India requests retrieve retailer HTML. Bright Data and direct HTTP remain configurable alternatives. See [ScrapingBee documentation](https://www.scrapingbee.com/documentation/) for credit costs. Paid tiers are not automatically selected.

Amazon extraction uses primary price containers, title, availability, purchase controls, image metadata and specification rows. Flipkart supports CSS price selectors and a unique primary Product JSON-LD record, including a truncated heading. Script text about unrelated stock does not determine primary availability. Missing prices, delivery charges and variant details are never invented.

## Source capabilities

The default `retail` policy enables current prices, 30-day history, target alerts and exact variant matching. It describes retailer-page tracking without claiming a licensed feed agreement. `SOURCE_POLICIES_JSON` can override each source using the schema in `packages/providers/index.ts`. The separate `live` feed mode requires its actual agreement reference; do not fabricate one. Search currently searches the imported catalog. Paste a direct Amazon.in or Flipkart URL to add another listing.

New history starts with successful observations; the application cannot reconstruct uncollected past prices. Current offers expire after one hour. Retained prices can be shown as last observed, but stale offers cannot trigger alerts or win current-price comparisons. Product metadata is retained with source evidence rather than erased merely because no current offer exists.

## Collection budget and hosting

`SCRAPER_REQUESTS_PER_DAY` defaults to 40 across public imports and scheduled collection, enforced transactionally in PostgreSQL. Each source also permits two requests per minute. This limits requests, not provider credits: premium/rendered requests have different costs. Unwatched catalog listings refresh daily; enabled targets receive hourly checks within the budget. A worker tick logs scheduled jobs and notification dispatch outcomes.

Run `pnpm migrate`, then `pnpm worker` on a continuous host. A free Render web service can sleep. The optional `.github/workflows/collection.yml` instead uses a bounded `pnpm worker:once` scheduled collector. Add its listed secrets to GitHub Actions and set repository variable `ATLAS_SCHEDULE_ENABLED=true` to enable it. It is disabled until configured. [GitHub schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) can be delayed, so they do not guarantee instant detection.

## Operator commands

```sh
pnpm catalog:import
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
