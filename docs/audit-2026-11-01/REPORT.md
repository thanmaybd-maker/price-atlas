# Price Atlas audit — 1 November 2026

This is a bounded engineering and UI audit, not proof that every possible defect or retailer has been tested. Existing paper, ring, lotus and theme designs are preserved. Private evidence stays under ignored `data/`; credentials and recipient addresses are excluded from this report.

## Demonstrated defects and repairs

1. **Telegram test feedback:** a rejected fetch escaped without recovery, and an HTTP 503 containing `ok: true` displayed success. Browser regressions reproduced both. The UI now requires successful HTTP status and handles uncertain sends with an explicit warning to check the chat before retrying. Busy labels no longer call a disconnect operation “Sending test”.
2. **Budget queries:** `500` in “Cetaphil facewash under 500” was treated as a model token by discovery conflict checks. Discovery now separates deterministic intent from search terms, keeps the real budget filter, and preserves model/volume constraints. Facewash/facial-cleanser search aliases recognize “Cetaphil Gentle Skin Cleanser” without merging different volumes. Cache version changes prevent reuse of earlier discovery decisions.
3. **Blocked product links:** failures lost their typed outcome and promised a stronger connection on retry. They now retain the source error code and offer honest retry/store choices. Flipkart and Nykaa product slugs can supply an explicitly labelled cross-store search hint; the hint is never accepted as identity or price evidence.
4. **Source evidence:** its badge always said “Verified • INR”, including stale, rejected or foreign-currency observations. It now distinguishes checked item prices from recorded prices needing store verification, preserves native currency and uses “Price source and verification” instead of developer-facing “Debug source proof”.
5. **Worker assist authorization:** a deterministic running-job ID was sufficient to trigger a paid fetch. Each claimed job now receives an unpredictable, lease-bound capability. The web app atomically consumes it before fetching. Guessed tokens and replay are rejected without spending provider credits; completed/failed jobs remove the token. Worker and web app must both deploy this revision.
6. **Email explanation:** unavailable price-alert email is distinguished from Google sign-in and login/confirmation mail. No Gmail sender or browser-push channel has been invented or enabled.

## Infrastructure evidence

- Vercel production was READY on `db2a637` at audit start. Its live health endpoint and database probe passed. An initial one-hour runtime-log query exceeded the available retention window; the corrected fifteen-minute error/fatal query returned no matching logs. This is not proof that earlier errors never occurred.
- Render's user-confirmed **My Workspace** contains the free `price-atlas` web service running `pnpm worker`. Sampled logs show worker ticks and catalog waiting, without error-level records in the queried window. Zero observations on an idle tick does not establish a crashed worker. The app's wake scheduling remains necessary for a sleeping free service.
- Supabase `price-atlas` is ACTIVE_HEALTHY. Google login is enabled, and the authorized user's identity has the Google provider. The audit browser remained signed out; actual Google callback plus a real target save/reload was not reproduced there. Account-isolation and save flows have automated database/browser coverage, which is distinct evidence.
- **Real Telegram acceptance passed:** exactly one test was sent after matching the user-specified account to an enabled connection. Telegram returned success with a message receipt, and the user explicitly confirmed receipt. No second test, account unlink or opt-out message was sent. Webhook registration, matching hosted secret and zero pending updates also passed readiness checks.
- GitHub's history workflow failed at **Check configuration**: `Add the DATABASE_URL repository secret.` Archive and Keepa steps were skipped. The available GitHub connector cannot manage Actions secrets or dispatch workflows; the audit browser also lacks a signed-in GitHub settings session. No credentials were copied or backfill claimed.

## Collection and coverage

The initial readiness sample found **444 catalog products**, **41 fresh eligible offers**, and a current-day ledger of **165 requests / 17 credits**. These are timestamped samples, not permanent counters. Production explicitly configures ceilings of **1,000 requests/day, 100 paid credits/day and 300/month**; the code hard ceilings are higher for credits, so environment and code ceilings must not be confused.

Retained eligible domestic history covered **287 products**. None had a complete seven-day or thirty-day window. Maximum observed coverage was **5 of 7** and **6 of 30** India dates. The broader retained observation count was **578**, across six distinct India dates. No imported Wayback/Keepa source rows appeared in that source-count sample. This audit does not fabricate missing dates or count failed checks as price observations.

The exact Flipkart iPhone URL in the screenshot had a cached verification-page failure. A separate five-credit ScrapingBee JavaScript experiment also returned `blocked`; no product or price was imported from it. Buying more keys therefore has no demonstrated benefit for that listing. The pre-repair Cetaphil/Amazon name query returned zero verified products; the budget/model-token regression was then reproduced deterministically and repaired. Live retrieval can still fail after fixing matching.

The existing bulk importer is still Nykaa-focused, with 349 bulk-verified entries. That does not imply other catalog entries are fake. Catalog balance, 2,500 verified base products, an expanded daily cohort and seven actual reliability days remain separate execution requirements.

## Additional retailers and blocked-source alternatives

These are researched candidates, not newly integrated or endorsed stores:

- **Robu.in:** [official catalog](https://robu.in/) has development boards, sensors, components, motors, tools and maker kits. A [representative Arduino page](https://robu.in/product/arduino-uno-r3-/) distinguishes a compatible board from authentic branded boards. Pilot exact SKU/brand identity before comparison; never group clones solely by “UNO R3”. No unrestricted public catalog API was established.
- **MDComputers:** [official store](https://mdcomputers.in/) exposes computer/peripheral categories and product links, useful for monitors and components. Verify exact model, capacity and warranty plus source terms before adapter/import work. Discovery visibility is not a verified product-page quote.
- **Bookswagon:** [official FAQ](https://www.bookswagon.com/faq) and [shipping information](https://www.bookswagon.com/shippingpopup.aspx) support an ISBN/binding/edition pilot. Delivery rules must remain seller/order/location specific; a metadata ISBN dataset cannot replace Indian price evidence.

Use existing budgeted direct HTML/structured extraction first, then an explicitly requested supported-provider verification. Where a retailer supplies an authorized affiliate feed/API, prefer that documented contract. User-provided URL/CSV candidates are another discovery lane; their prices still require verification. If access remains blocked, preserve source links and the unknown price. Do not solve a CAPTCHA automatically, rotate accounts to evade limits, or copy private tracker endpoints.

No additional paid API is demonstrated as necessary yet. First measure a 20-URL specialist pilot and compare accepted exact listings per request and credit. Do not add a logo/retailer count before URL validation, extraction, matching, failure fixtures and source health exist.

## Security and scaling findings still open

Supabase reported a mutable search path for `atlas.request_user`, public/authenticated execute grants on the platform's `rls_auto_enable` security-definer event-trigger function, and disabled leaked-password protection. The trigger function was inspected: it returns `event_trigger`, uses `pg_catalog` and enables RLS on new public tables. A generic advisory is not proof that this trigger is an ordinary remotely callable RPC. No platform trigger or grant was changed blindly.

The app-owned function's search path should be pinned through a tested migration. Review platform-function grants with Supabase guidance. [Password protection](https://supabase.com/docs/guides/auth/password-security) currently requires Pro or above; no plan upgrade was purchased. Performance advisors reported eleven unindexed foreign keys; inspect actual query plans before adding indexes or claiming measured speedups.

Further required work: balanced resumable imports, server pagination and 2,500-product load checks; real save/reload and opt-out acceptance; a configured Gmail sender and push subscriptions with receipt tests; dated FX/serviceability adapter acceptance; hosted Auth/storage/application recovery; the missing GitHub secret; and seven real reliability days. HyperFrames preview remains a later deliverable after these flows are ready. No video was created, no CUDA training ran and no skills were installed or authored merely to perform this audit.

## Verification

See `GATES.md` and ignored `data/audit-*-20261101.*` outputs for current check results. Unit/browser fixtures do not create live recipients or prove market price changes. The real Telegram test is separately documented above. Publication and post-release checks are recorded in the ledger when observed.
