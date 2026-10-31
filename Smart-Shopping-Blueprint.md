# Smart Shopping — Complete Product and Implementation Blueprint

Prepared for Thanmay • 4 October 2026 • One integrated release specification

**Working brand: PRICE ATLAS.** Working promise: “Find the right product. Know the better price.” The name is a creative placeholder; domain and trademark availability have not been checked.

This document specifies one complete build: customer website, backend, database, collection workers, matching, accounts, watchlists, alerts, administration, deployment, and verification. The numbered areas describe parts of the same release; they are not milestones or separately delivered prototypes. Architecture and performance figures below are proposed decisions and acceptance targets, not results from an existing application.

**1. Product definition and the first complete release**

Build an India-focused comparison and price-monitoring website for Amazon.in and Flipkart. Visitors search by text or submit a supported product URL, identify an exact product variant, compare available matching offers, inspect recorded history, and leave for the retailer to buy. Signed-in users save products and set target-price alerts.

The first complete release includes:

- Responsive home, search, product, comparison, watchlist, alerts, settings, help, and administration screens.
- Search suggestions, category-specific filters, sorting, pagination, and link import.
- Exact-variant price comparisons with source, seller where available, availability, delivery context, price conditions, and last successful observation.
- Lowest eligible price highlighting, with ties and incomplete comparisons handled explicitly.
- Store purchase links and permitted affiliate attribution.
- Recorded price history, configurable date ranges, source coverage, and target-price overlays.
- Email sign-in and Google sign-in; persistent saved lists; email and in-app price alerts.
- AI-assisted attribute extraction and match proposals, supported by deterministic validation and a review queue.
- Background updates, delivery retries, administrative correction tools, monitoring, backups, and an executable deployment procedure.

Use a category registry that can expand without rewriting the engine. Activate phones, laptops, tablets, headphones/earbuds, and monitors first, provided the selected sources cover them. These categories give meaningful comparison depth. Model pack quantity and unit size now, but do not advertise support for every grocery, fashion, or appliance variant until its attribute rules and matching evaluation exist.

Working launch capacity assumption: 5,000 canonical variants, roughly 10,000 source listings, and up to 10,000 registered users. Registration volume is not a throughput guarantee; collection volume and peak request load are sized separately below.

Phone OTP, an open-ended shopping assistant, WhatsApp/SMS notifications, browser extensions, native mobile apps, and Three.js scenes remain explicit extensions. The initial system must leave clean interfaces for them, but completion does not depend on those later ideas. Purchases, payments, carts, order fulfilment, and retailer returns happen at the destination retailer.

**2. The external dependency that determines live feasibility**

Current official sources reveal a material dependency. Amazon India participation requirements prohibit sites with price tracking or price alerting unless otherwise agreed by Amazon. Amazon credentials alone therefore do not establish permission for the proposed product. [Amazon India participation requirements](https://affiliate-program.amazon.in/help/operating/policies)

Amazon’s India agreement also limits content caching and image storage and imposes conditions on reuse. A permanent history database cannot be justified merely by having access to current prices. Obtain terms covering the actual comparison, retention, alerts, and matching use. [India operating agreement](https://affiliate-program.amazon.in/help/operating/agreement)

Flipkart’s API overview names shopping comparison as a use, while its API terms include language about similar or competitive platforms. Clarify applicability to this website and the rights to retain observations. Public documentation does not prove that a new account can obtain working credentials today. [Flipkart overview](https://affiliate.flipkart.com/api-docs/af_overview.html), [API terms](https://affiliate.flipkart.com/api-docs/af_tou.html), [registration documentation](https://affiliate.flipkart.com/api-docs/af_register.html)

The provider selection order is: direct authorized store integration; licensed data partner with documented India coverage and suitable rights; another expressly permitted collection method. Buying a scraping or extraction API does not, by itself, settle the intended commercial use or historical-storage rights.

The chosen source contract must answer: which stores/categories; current prices and stock; search and link resolution; delivery location; seller and condition; historical retention; alerting; image usage; affiliate links; AI processing; quotas; freshness; redistribution/display; and behavior when access ends.

Implement source capabilities as configuration backed by the agreement: `search`, `resolveLink`, `currentPrices`, `history`, `alerts`, `matching`, `aiProcessing`, `imageProxying`, field-specific expiry, attribution, and per-account quotas. A credential is not a capability grant. If a restriction is site-wide, capability flags alone do not make the combined site acceptable; the source agreement must cover the entire product.

Build and test the complete software with synthetic fixtures if credentials are pending. Keep those fixtures in a visibly labeled demo environment. Do not mix them into production search or represent them as collected prices. The full two-store live product is not complete until its sources are actually connected and validated. This is an external dependency, not a proposed smaller product.

**3. Product positioning and business model**

The differentiator is confidence in a buying decision: the same variant, comparable prices, visible collection times, and useful reminders. The interface should answer “What exactly am I buying, what will it cost under these conditions, and should I set a target?” within a few seconds.

Monetization can use approved affiliate links. Price ranking must remain independent of commission. Sponsored placement, if introduced, must be separate from the cheapest-offer ranking and labeled. Record outbound clicks as clicks; only claim completed purchases or actual savings when supported by retailer reporting or explicit user confirmation.

Primary product metrics: search-to-product rate, searches with two valid store matches, alert creation, weekly active watchers, target-met notification delivery, and qualified outbound clicks. Trust metrics: match correction rate, stale-offer exposure, source freshness, price anomaly rate, and notification complaints. Cost metrics: cost per fresh tracked variant and cost per active watcher.

**4. Creative direction and design system**

Use the feel of a precise shopping instrument: generous product imagery, editorial typography, a restrained grid, and clear data. The defining visual element is a compact price-history line threaded through comparison and watchlist views. Avoid invented urgency, inflated savings, and decorative numbers that resemble real offers.

Proposed design tokens:

| Element                | Direction                                                     |
| ---------------------- | ------------------------------------------------------------- |
| Main surface           | Warm near-white `#F7F8FA`                                     |
| Strong text            | Ink `#111827`                                                 |
| Primary action         | Deep emerald `#047857`, tested with its text color            |
| Lowest-price emphasis  | Soft green surface with dark green text and an explicit label |
| Caution                | Amber icon plus explanatory text                              |
| Secondary chart series | Indigo, differentiated by line pattern as well as color       |
| Typography             | Manrope for display; Inter for UI and tabular numerals        |
| Spacing                | 4/8/12/16/24/32/48/64 px system                               |
| Corners                | 12 px controls/cards, 20 px large panels                      |
| Motion                 | 150–220 ms for feedback; reduced-motion support               |

Specify tokens for light and dark themes and review both. Local font hosting depends on the font license. Use permitted product images; do not generate imaginary images of real products and present them as catalog photos. Provider images may need direct rendering rather than caching through an optimization service.

Reference direction: study [Linear](https://linear.app/) for hierarchy and restraint, [Vercel Commerce](https://github.com/vercel/commerce) for server-rendered product presentation, and [shadcn/ui](https://github.com/shadcn-ui/ui) for accessible primitives that can be styled into an original system. Vercel Commerce is Shopify-oriented; use its patterns rather than importing an unrelated checkout backend.

Baymard’s comparison research highlights the importance of consistently formatted specifications and understandable labels. Build our attribute dictionary and spec explanations into the design from the start. [Baymard comparison examples](https://baymard.com/ecommerce-design-examples/39-comparison-tool)

**5. Screen-by-screen experience**

| Screen               | Required behavior                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                  | Prominent search/link field, category entry points, real recorded drops, explanation of comparison and tracking, recently viewed items |
| `/search?q=...`      | Canonical product cards, suggestions, filters, sort, result count, matched variants, per-source status                                 |
| `/category/[slug]`   | Curated category description, relevant filters, searchable products, shareable URL state                                               |
| `/p/[slug]`          | Exact variant selector, images, offer comparison, price history, target alert, specifications, source timestamps                       |
| `/compare?items=...` | Compare up to four products; highlight specification differences; store comparison remains inside each exact variant                   |
| `/watchlist`         | Collections, target gap, eligible current price, sparkline, freshness, notification status, edit/pause/remove                          |
| `/alerts`            | Active rules and notification history, with delivery state and channel settings                                                        |
| `/settings`          | Account identities, email preferences, timezone, data export/deletion, session controls                                                |
| `/auth/*`            | Email verification and Google callback, expired-link recovery, return to intended action                                               |
| `/help`, `/about`    | Methodology, supported sources, price terminology, contact, commercial disclosures                                                     |
| `/admin/*`           | Catalog, matches, providers, collection runs, anomalies, delivery failures, operational settings                                       |

Home hero copy: “The right product. The better price.” Supporting copy: “Compare matching offers, explore recorded prices, and set your target.” Do not claim real-time updates if checks are scheduled.

Product cards show an image, short model name, exact variant chips, lowest eligible price, store coverage, last checked state, and save button. A card with one offer says “1 available offer”; it does not imply both stores were successfully compared.

Product detail uses a two-column desktop layout: imagery/spec identity on the left, comparison and target action on the right, followed by the graph. The comparison table has store, seller when known, item price, delivery, comparable total, stock, observation time, and Buy Now. Mobile uses stacked offers and a sticky action bar without obscuring content.

Keep a “Why these match” disclosure with model, storage/RAM, quantity, condition, and other decisive attributes. Show alternatives in a separate area with differences stated plainly. A cheaper 128 GB model must never silently replace a selected 256 GB model.

Provide deliberate loading, empty, partial-data, no-match, unsupported-link, expired-session, unavailable-source, and offline states. Every button must complete an action or explain why it cannot. Preserve the typed target and selected variant across authentication.

**6. Core user journeys**

Text search: normalize the query; search the existing catalog; render available results promptly; request permitted discovery if results are missing; update results when the background operation completes. Show “Checking supported stores” with individual source states instead of blocking the entire page.

Link import: validate the URL; follow only supported short-link routes; extract a stable source product ID; reuse a known listing or enqueue resolution; infer its exact variant; look for the equivalent listing at the other store; present uncertain results as candidates rather than confirmed comparisons.

Target alert: choose the exact variant, target value, supported store scope, and channel; authenticate if necessary; verify the destination; save atomically; show when checks happen. Default copy is “Notify at or below ₹25,000,” and the implementation uses `<=`. If a future UI offers strict “below,” store an explicit `<` operator.

Purchase: display the retailer and observed price context; open its validated product link. Prefer direct approved links. If a source permits a first-party redirect, it must preserve attribution and accept only stored destination IDs, never arbitrary external URLs.

**7. Exact price and eligibility rules**

Store money as integer paise with currency `INR`. ₹25,000 is `2500000` paise. Do not use floating-point arithmetic for rankings or target comparisons.

For a comparable offer:

`known payable total = item price + known mandatory shipping + known mandatory charges - confirmed unconditional discount not already included`

Avoid double-counting a discount already reflected in the source price. Do not add a tax twice. Record each component and whether it is included in the published figure. Unknown shipping is `null`, not zero.

Default cheapest-offer eligibility requires the same exact variant and pack, new condition, supported currency, an accepted match, permitted display, a fresh successful observation, and known available stock. Scope the comparison to the same delivery context when available. Distinguish “source default location” from “your pincode”; never invent user-specific delivery eligibility.

Bank cards, exchange values, membership deals, EMI cashback, and coupons needing user action appear separately with conditions. They do not lower the default winner. If the total is incomplete, label it “lowest listed item price; delivery extra/unknown,” and do not call it the cheapest delivered offer. Configure alerts against the clearly disclosed price basis; changing that basis changes the alert rule version.

Equal eligible prices produce a tie. One eligible offer is shown as the available offer. No eligible offers produces an unavailable/refreshing state. Stale values cannot win or trigger alerts. Display historical values only where retention is permitted and label them as historical.

Freshness is per source and field, not one universal constant. Track `providerObservedAt`, `fetchedAt`, `lastSuccessfulCheckAt`, `validUntil`, and collection outcome separately. Fetching a provider’s old observation does not make the price new. Display the time appropriate to its provenance.

**8. Recommended technology stack**

| Responsibility          | Choice                                                         | Reason                                                                                |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Web and application API | Next.js App Router + React + TypeScript                        | Public product rendering and authenticated app in one codebase                        |
| Components              | Tailwind CSS + customized shadcn/Radix primitives              | Consistent styling and accessible interaction foundations                             |
| Charts                  | Recharts through a small internal chart API                    | Multiple price series, tooltips, target lines, responsive rendering                   |
| Client server-state     | TanStack Query only for interactive updates                    | Polling, optimistic watchlist feedback, invalidation                                  |
| Validation              | Zod                                                            | Shared request, adapter, and job schemas                                              |
| Database                | Managed Supabase PostgreSQL                                    | Relational product identity, price records, transactions, account integration         |
| Authentication          | Supabase Auth                                                  | Email and Google now; phone provider integration later                                |
| Database layer          | Drizzle + explicit SQL migrations                              | Typed queries with direct control over indexes and transactions                       |
| Search                  | PostgreSQL full-text + `pg_trgm`                               | One operational database until measured search requirements justify a separate engine |
| Jobs                    | BullMQ + managed TCP Redis                                     | Durable work coordination, retries, concurrency, scheduling                           |
| Worker runtime          | Dedicated long-running Node.js container                       | Collection and delivery do not depend on browser requests                             |
| Email                   | Resend behind `NotificationProvider`                           | Transactional alerts and delivery events                                              |
| Hosting                 | Vercel for web; Railway for worker/Redis; Supabase for DB/Auth | Proposed practical deployment with independently scalable workers                     |
| Observability           | Structured logs + OpenTelemetry + Sentry                       | Correlate requests, collections, matches, and notifications                           |
| Verification            | Vitest, Playwright, axe, k6                                    | Domain tests, browser journeys, accessibility, load                                   |
| Repository              | pnpm workspace + GitHub Actions                                | Shared contracts and reproducible CI                                                  |

Choose supported stable dependency versions when implementation starts, verify compatibility, and commit the lockfile. Do not hard-code a plan to an unverified future package version. Verify chosen hosting regions, Redis persistence options, and plan limits before provisioning; keep worker, queue, and database close geographically.

Supabase documents email, social, and phone authentication, plus integration with row-level policies. [Supabase Auth](https://supabase.com/docs/guides/auth) PostgreSQL documents trigram indexes for similarity search. [PostgreSQL pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html) shadcn provides Recharts-based chart building blocks. [Chart examples](https://ui.shadcn.com/charts/line)

**9. System boundaries and repository shape**

Use a modular application with two runtime processes: the web/API and the background worker. Share domain logic; keep collection, matching, and notification delivery out of page handlers.

Browser → Next.js application services → PostgreSQL.

PostgreSQL durable work/outbox records → dispatcher → Redis/BullMQ → collection and matching workers → source adapters → normalized observations → price projection → alert evaluation → notification outbox → email provider and in-app inbox.

The database is authoritative for business state. Redis coordinates execution and accelerates selected reads; loss of a cache must not erase watchlists or the knowledge that an alert needs delivery.

````text
apps/
  web/                  routes, layouts, API handlers, browser components
    worker/               dispatch, collectors, matching, alerts, maintenance
    packages/
      domain/               product identity, money, eligibility, alerts
        contracts/            API, event, job and provider schemas
          database/             Drizzle tables, SQL, migrations, repositories
            providers/            amazon, flipkart, licensed partner, demo
              matching/             normalization, candidates, validation, evaluation
                notifications/        channel adapters and message templates
                  ui/                   design tokens and shared components
                    telemetry/            logs, traces, metrics and redaction
                    tests/
                      fixtures/             synthetic catalogs, edge cases, source responses
                        integration/          transactions, adapters, jobs, policies
                          e2e/                  customer and operator browser journeys
                            load/                 reproducible workload and results
                            docs/
                              architecture.md       decisions and service boundaries
                                providers.md          capability and data-rights matrix
                                  operations.md         deployment, recovery, incidents
                                    data-dictionary.md    field definitions and business semantics
                                    ```

                                    Route handlers and server actions call the same domain services. Server-rendered pages call those services directly rather than making HTTP calls to their own API. Keep provider SDKs, database credentials, and LLM credentials in server-only modules.

                                    **10. Database blueprint**

                                    Use UUID primary keys, UTC `timestamptz`, foreign keys, explicit lifecycle states, and validated category schemas. Localize times to the user’s timezone, defaulting to Asia/Kolkata.

                                    | Table | Important columns and purpose |
                                    |---|---|
                                    | `profiles` | Auth user ID, display name, timezone, preferences, deletion state |
                                    | `categories` | Name, slug, required identity attributes, schema version |
                                    | `brands` | Canonical name and verified aliases |
                                    | `products` | Brand, category, model family, slug, description provenance |
                                    | `variants` | Product ID, normalized model number, RAM/storage/color/size/pack/region attributes, identity fingerprint, schema version |
                                    | `product_identifiers` | Variant ID, identifier type, value, market, provenance; GTIN/MPN where reliable |
                                    | `stores` | Store code, market, domain, approved-link behavior |
                                    | `data_sources` | Provider/account reference, capability grant, policy version, quotas, health; secret reference only |
                                    | `listings` | Store ID, source external ID, canonical URL, current match assignment, source attributes, status |
                                    | `listing_matches` | Listing, variant, decision, hard-field checks, evidence, method, model/rule version, reviewer, effective interval |
                                    | `offer_contexts` | Listing, source, seller when known, condition, fulfillment, location scope, quantity, membership scope |
                                    | `collection_runs` | Logical run key, context, scheduled/start/end times, source response status, retries and error category |
                                    | `price_observations` | Context, collection run, match version, price components, currency, availability, provider time, fetch time, rights/expiry, evidence reference |
                                    | `current_offers` | Context primary key, accepted latest observation, comparison basis, valid-until; rebuildable projection |
                                    | `price_daily_rollups` | Variant/context/source/day/basis, observed min/max/last/count, coverage; only where retention permits |
                                    | `watchlists` | Owner, title, creation time |
                                    | `watchlist_items` | List, exact variant, selected context preferences, saved time |
                                    | `alert_rules` | Owner, variant, store scope, price basis, target paise, operator, channel, enabled state, rule version |
                                    | `alert_state` | Rule ID, current episode, last eligible state, triggering observation, cooldown/re-arm information |
                                    | `alert_events` | Rule/version/episode, observed qualifying price, eligible offer, evaluation time, reason |
                                    | `notifications` | In-app record, channel, destination reference, delivery state, read time |
                                    | `notification_attempts` | Notification, attempt, provider ID, status, time, next retry, deduplication key |
                                    | `notification_preferences` | User/channel, verification state, unsubscribe/suppression, quiet-hour preference |
                                    | `outbox_events` | Event ID/type/version, minimal payload, dispatch lease, attempts, completion |
                                    | `import_requests` | User/session, supported source ID, processing state, result variant or candidate set |
                                    | `scheduled_work` | Durable due time, kind, context, priority, lease, scheduling generation |
                                    | `admin_audit_log` | Actor, action, entity, before/after references, reason, time |
                                    | `click_events` | Store/listing, timestamp, minimal attribution; short retention and no invented conversion |

                                    Images and descriptions carry source and expiry metadata. A product identifier may be durable while a provider title, image link, or price is temporary. Keep those lifecycles separate. Do not retain raw provider payloads, embeddings, traces, or derived summaries beyond their allowed use.

                                    Key constraints: unique store/external listing ID; unique canonical variant fingerprint within the defined product/schema; unique context identity; one observation per logical source run and context; one watchlist item per list/variant/context; unique alert event per rule/version/episode; unique channel delivery intent per event/destination.

                                    Important indexes: product/variant search vector GIN; normalized model and identifiers B-tree; trigram index on search text; observation `(offer_context_id, provider_observed_at DESC)`; partial active-alert indexes by variant/context; due-work `(next_run_at, priority)`; outbox pending state and due time; user-owned lists by owner.

                                    Keep full observation history append-only until permitted retention expiry, but allow audited invalidation. Monthly partitioning is a sizing decision to make from expected volume and retention; if enabled, design uniqueness keys to include the partition key or use a separate ingestion-ledger constraint. Never assume a global unique index spans arbitrary partitions.

                                    Apply row-level policies to user-owned tables. The request database client must use a non-bypass role with validated identity claims set transaction-locally, or use the Supabase user-token client. A Drizzle connection as database owner/service role does not automatically gain per-user protection. Worker and admin access use separate least-privilege roles. Test ownership through both API and direct exposed-table paths.

                                    **11. Source adapter and collection implementation**

                                    Define one adapter contract with capability discovery, `search`, `resolveProduct`, `fetchOffers`, optional batch fetch, health reporting, and source-prescribed link creation. Use typed responses with a capability-policy version and data provenance.

                                    Every normalized observation needs:

                                    ```text
                                    source ID and external listing ID
                                    offer context and model/variant attributes
                                    item price, shipping, mandatory charges, discount inclusion flags
                                    currency, stock state, condition, seller/location knowledge
                                    provider-observed time, fetched time, valid-until
                                    match assignment version and evidence reference
                                    history/alert/display eligibility and permitted retention
                                    ```

                                    Missing data remains missing. Parse price strings and localized separators once inside the adapter. Reject negative prices, unsupported currencies, invalid identifiers, impossible timestamps, and contradictory conditions. Do not treat errors or blocked pages as “out of stock.”

                                    Maintain a source-specific collection ledger. Distinguish timeout, quota exhaustion, authentication failure, unavailable item, malformed response, parse/schema drift, and explicitly unavailable stock. Retry transient failures with exponential backoff and jitter; pause recurring authentication/configuration failures for operator action. Circuit breakers prevent an outage from consuming every worker.

                                    Current Amazon documentation centers the Creators API and its catalog operations. Verify India account eligibility and actual quotas before selecting poll frequency; do not follow an old tutorial that assumes unrestricted PA-API access. [Creators API introduction](https://affiliate-program.amazon.in/creatorsapi/docs/en-us/introduction), [API rates](https://affiliate-program.amazon.in/creatorsapi/docs/en-us/concepts/api-rates)

                                    Flipkart documentation provides feeds, searches, and delta feed mechanisms. Use supported batch/delta operations where they reduce refresh cost. [Flipkart product API reference](https://affiliate.flipkart.com/api-docs/af_prod_ref.html)

                                    When multiple providers describe the same listing, use a configured authoritative source or reconcile observations explicitly. Do not silently combine components from incompatible observations to manufacture a total.

                                    **12. Scheduling, consistency, and recovery**

                                    The scheduler prioritizes actively watched variants, recently viewed products, fresh imports, and then the catalog background sweep. A proposed operating policy is hourly checks for watched contexts, every 4–6 hours for active unwatched items, and daily discovery/sweeps, but actual quotas, rights, and cost determine the deployed intervals. If display expiry is shorter than refresh frequency, hide expired prices between checks.

                                    Deduplicate at listing/context level. Ten thousand users watching one phone should cause one contextual collection followed by alert fan-out, not ten thousand store requests. Use source-specific concurrency, token-bucket quotas, batch APIs where available, and a reserved fraction of capacity for customer-triggered imports.

                                    The scheduler leases due records transactionally, using bounded batches and `SKIP LOCKED` or equivalent. Queued jobs carry a stable work ID. Database idempotency remains necessary even if BullMQ deduplicates jobs, because queue history may expire. BullMQ specifically recommends jobs that remain correct under retries. [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs)

                                    On successful collection, one database transaction inserts the valid observation, conditionally updates its current-offer projection, and appends an outbox event. Use authoritative observation order; a slow earlier request cannot overwrite newer state. When the source has no trustworthy observation timestamp, use a defined request-start sequence instead of response completion time. Lock or version the affected context/variant during projection and alert evaluation. An asynchronous evaluator must recompute from current accepted offers rather than assume the triggering event is still current.

                                    Schedule expiry evaluation as well as price updates. Stock changes, match corrections, and expiry can change the eligible minimum even if no numeric price changes. Read-time eligibility checks exclude expired offers immediately; background expiry jobs reconcile projections and rules. Bound application caches by observation expiry and let open browser pages remove a winner when its validity ends. Database connection pools and worker concurrency must have explicit limits so a collection spike cannot exhaust interactive requests.

                                    The dispatcher publishes pending events with leases and retries. Consumers deduplicate event IDs. Keep source collection, matching, alert evaluation, and delivery as separate job types so retries do not repeat unrelated side effects.

                                    Redis must support BullMQ’s required TCP connection behavior and persistence. Configure queue memory behavior deliberately and separate disposable cache eviction from durable queue data. A reconciliation job recreates undispatched work from database state after queue loss.

                                    Large implausible jumps, zero-price anomalies, or sudden cross-catalog parsing changes go into quarantine. A second check can validate a genuine unusual sale. The published prior observation still expires on time; quarantining a new value must not keep an old price fresh forever.

                                    **13. Matching engine: AI assistance with verifiable identity**

                                    Implement normalization before model calls: brand aliases, spacing, regional naming, model suffixes, memory units, screen sizes, quantity, and known abbreviations. Store raw and normalized attributes with evidence and confidence.

                                    Category identity examples: phones need model/region, RAM, storage, condition, and selected color; laptops additionally need CPU generation/model, GPU, storage, display configuration, and bundle; monitors need exact model, size, resolution, and refresh variant; headphones need exact generation/model and pack. Unknown required fields cannot be silently accepted.

                                    Matching pipeline:

                                    1. Retrieve candidates using reliable identifiers and brand/model rules.
                                    2. Narrow by category and decisive attributes.
                                    3. Use fuzzy text and, where licensed, embeddings for candidate recall.
                                    4. Ask a configurable LLM only to extract ambiguous fields or judge a small candidate set.
                                    5. Validate structured output against the schema and source evidence.
                                    6. Reject any hard-attribute conflict, regardless of model confidence.
                                    7. Auto-accept only within an evaluated rule/model policy; send ambiguous matches to review.

                                    LLM output includes candidate IDs, extracted fields, evidence spans, conflicts, unknowns, and proposed decision. Do not interpret an LLM’s self-reported confidence as a calibrated probability. Tune acceptance using a labeled validation set and per-category error analysis. The proposed release target is at least 99.5% precision on auto-accepted matches in a representative held-out set, with recall reported separately and zero observed hard-variant conflicts; the measured sample and uncertainty must accompany the result.

                                    The model must never invent missing model numbers or prices. External titles and descriptions are input data, not instructions. Send only permitted product data to the model; avoid account information. Cache extraction by content hash, schema/rule version, and model version only within the source’s retention permission.

                                    Use a `MatchingModel` interface so the application can later use a chosen Claude, Kimi, GLM, DeepSeek, Qwen, or other API after its structured-output support, data handling, reliability, and cost are tested. Choose one primary model for launch. Deterministic matching continues if it is unavailable; uncertain matches wait for review.

                                    Store decisions as versioned assignments. On a correction, prevent new alerts from the wrong relationship, rebuild affected current projections and permitted graph data, and retain an audit trail. Do not silently relabel old observations without their original assignment provenance.

                                    **14. Price-history implementation**

                                    Graphs show observations since tracking actually began, or a licensed historical feed whose provenance is identified. Synthetic prices are never used to fill a real graph. Default to a 30-day view with 7/90-day and all-recorded controls where data exists.

                                    Use one consistent price basis per series. Do not splice item-only prices into delivered totals or mix user locations. Show separate store series, precise tooltip times, target line, record count, and tracking start date. Use step segments only within justified validity intervals; leave visible gaps through unknown periods. Out-of-stock or failed checks must not create a zero-price point.

                                    Daily aggregation returns observed min/max/last and coverage count. Preserve observed extrema during downsampling; a hidden one-hour dip must not disappear just because the chart requests fewer points. Add an accessible tabular alternative and keyboard-readable summaries.

                                    Text such as “lowest recorded in 30 days” requires actual coverage and that bounded time window. Sparse data should say “lowest among 12 recorded checks” or similar. Never say “all-time lowest” from a short tracking period. Target suggestions can use permitted historical observations and are labeled suggestions, not predictions.

                                    **15. Alert state machine and delivery**

                                    Evaluate the lowest fresh eligible offer within each rule’s variant, context, store scope, and price basis. A lower mismatched or conditional offer does not qualify.

                                    Default behavior:

                                    - Creating a rule already met by a fresh eligible offer creates one “Target already met” event.
                                    - Crossing from above target to at/below target creates one target-met episode.
                                    - Repeated qualifying checks in that episode do not create new notifications.
                                    - Stale data, collection errors, and unknown availability neither trigger nor re-arm the rule.
                                    - Re-arm after fresh above-target observations on two successive successful evaluations and a default 24-hour cooldown. Store this as explicit policy, not magic UI behavior.
                                    - A material edit to target, scope, variant, or price basis increments the rule version and reevaluates it.
                                    - Paused/deleted rules, obsolete rule versions, deleted accounts, and suppressed destinations are checked again just before delivery.

                                    Within a transaction, lock the rule state, record the evaluation, create the unique event for its episode, and create notification outbox entries. Persist in-app notification independently of email success. Fan-out large watch groups in paginated batches without one enormous transaction.

                                    Delivery uses a stable provider idempotency key and records the provider message ID. On network timeout after provider acceptance, query/reconcile where supported rather than blindly resending. Promise durable delivery attempts and deduplication within the supported window, not mathematically guaranteed exactly-once email receipt.

                                    If a message has waited long enough that its trigger observation expired, refresh/re-evaluate before sending. If the target is no longer met, suppress the misleading delivery and retain its reason. The in-app event can retain the historical observation only where permitted, marked with its original time.

                                    Email contains exact variant, observed price, store, checked time, an allowed destination link, and a manage-alert link. Re-check source rules for content and links in email; some grants may allow on-site display only. Provide per-alert pause and global price-alert unsubscribe. Keep login/security messages separate. Verify webhook signatures, deduplicate webhook events, and handle bounce/complaint suppression.

                                    **16. API contract and frontend data flow**

                                    All endpoints validate input, enforce authentication where required, scope object ownership, and return structured errors with request IDs. Cursor pagination and stable sorting are required for growing collections.

                                    | Method and endpoint | Contract |
                                    |---|---|
                                    | `GET /api/v1/search` | Query/filter/cursor → canonical variants, offers summary, source coverage, cursor |
                                    | `GET /api/v1/suggestions` | Prefix/category → suggestions without invoking an LLM per keystroke |
                                    | `POST /api/v1/imports` | Supported URL + idempotency key → `202` and operation ID, or existing result |
                                    | `GET /api/v1/imports/:id` | Authorized operation status and resolved variant/candidates |
                                    | `GET /api/v1/products/:id` | Identity, variants, licensed content, current source states |
                                    | `GET /api/v1/variants/:id/offers` | Context → eligible and ineligible offers with explicit reasons |
                                    | `GET /api/v1/variants/:id/history` | Range/basis/context → recorded points, coverage, provenance |
                                    | `POST /api/v1/variants/:id/refresh` | Coalesced permitted refresh request → operation status |
                                    | `GET/POST /api/v1/watchlists` | List/create the signed-in user’s collections |
                                    | `POST/DELETE /api/v1/watchlists/:id/items` | Add/remove owned exact-variant selections |
                                    | `GET/POST /api/v1/alerts` | List/create rules; monetary target is integer paise |
                                    | `PATCH/DELETE /api/v1/alerts/:id` | Version-aware edit, pause, or remove owned rule |
                                    | `GET /api/v1/notifications` | Owned in-app delivery history with cursor |
                                    | `POST /api/v1/account/export` | Asynchronous owned-data export |
                                    | `DELETE /api/v1/account` | Verified deletion request and cancellation of future deliveries |
                                    | `POST /api/v1/webhooks/email` | Verified provider delivery events |

                                    Use `409` for conflicting rule versions, `422` for invalid supported inputs, `429` for rate limits, and explicit source states for partial availability rather than a generic successful empty result. A source outage must not be indistinguishable from no matching product.

                                    Search URL parameters preserve query, filters, sort, and pagination. Authenticated responses are private/non-shared. Public cache keys include variant, context, source policy version, and price basis. Cache expiry cannot exceed the remaining validity of any displayed value.

                                    **17. Accounts, privacy, and application reliability**

                                    Support anonymous discovery and require an account only when persistence or delivery needs identity. Use provider-supported email authentication and Google OAuth with verified callback URLs, session refresh, and recovery flows. Do not write a custom password system.

                                    Future phone login uses the existing identity service and an SMS provider. Account linking requires proof of both identities; never merge accounts merely because a client supplies a matching phone or email. Phone support requires working SMS configuration and applicable provider/India messaging requirements to be verified at that time. [Supabase phone authentication](https://supabase.com/docs/guides/auth/phone-login)

                                    Production quality includes ownership checks, server-side secrets, admin MFA, parameterized database access, HTML/text sanitization, endpoint rate limits, and dependency updates. These are part of keeping accounts and price alerts functional. They do not add repeated permission prompts to ordinary implementation work.

                                    URL import must restrict destinations to supported retailer domains and known shorteners, enforce HTTPS, validate each redirect and resolved address, and reject local/private/metadata-network destinations. The worker should not become an arbitrary URL fetcher. Limit response size, redirects, and execution time.

                                    Keep personal data out of logs and model requests. Collect only what the product needs. Maintain published retention, export, deletion, consent/preferences, and contact information. At launch, verify applicable privacy, consumer, affiliate, and messaging requirements against current official rules and the actual business jurisdiction; this document does not assert that compliance has already been completed.

                                    **18. Administration and support tools**

                                    The operator console is part of the first delivery. Include searchable products/listings, uncertain match review with evidence side-by-side, approve/reject/unlink controls, source credentials health without exposing secrets, collection quota/lag, price anomaly review, failed jobs, notification status, and data corrections.

                                    Admins can pause a provider or channel, replay a failed job idempotently, request a fresh observation, and correct an identity. All consequential actions record actor, reason, and time. Changes to provider retention or source capability rules invalidate affected caches and trigger appropriate purges.

                                    Customer support needs a report-incorrect-price/match action, support reference ID, and a way to inspect the source observation behind a displayed comparison. Avoid exposing a user’s whole account merely to debug one listing.

                                    **19. Accessibility, SEO, and performance**

                                    Design keyboard navigation, focus management, form errors, chart alternatives, reduced motion, touch targets, and tested color contrast into components. Test screen-reader flows for search, variant selection, saving an alert, and interpreting the winner. Target WCAG 2.2 AA and retain actual audit results rather than claiming conformance from component selection alone.

                                    Render public product/category content on the server. Add canonical URLs, meaningful metadata, social previews, sitemaps for valid pages, and crawl controls for infinite filter combinations. Keep private account, import status, and arbitrary search-result routes out of indexing. Any structured offer markup must reflect visible valid data and publisher eligibility; do not assume a comparison site qualifies for every merchant-search enhancement.

                                    Proposed measured targets: p75 LCP ≤2.5 seconds, INP ≤200 ms, CLS ≤0.1 on representative mobile conditions; cached internal reads p95 ≤500 ms; uncached catalog search p95 ≤1 second under the agreed load. External discovery time is reported separately and remains asynchronous. Validate bundle budgets and lazily load charts. Follow the framework’s production guidance and then measure this application. [Next.js production guide](https://nextjs.org/docs/app/guides/production-checklist)

                                    **20. Deployment, operating environments, and observability**

                                    Create isolated development, staging, and production configurations. Preview deployments use demo/staging data and mail sinks, not production users or live notification destinations. Store all credentials in deployment secret managers and provide an `.env.example` with descriptions but no secrets.

                                    CI runs formatting/lint, type checks, domain and integration suites, migration validation, production build, selected browser tests, and secret/dependency checks. Deploy schema changes once through the pipeline. Prefer additive migrations, compatible app/worker changes, and delayed destructive cleanup. Record the app, worker, schema, adapter, and matching-policy versions in each release.

                                    Deploy web to Vercel and a containerized worker to the selected long-running host. Configure an external scheduler tick or a continuously running dispatcher with leader/lease coordination. Validate DNS, TLS, OAuth callbacks, sender-domain SPF/DKIM/DMARC, webhook endpoints, source connectivity, and graceful worker shutdown.

                                    Expose lightweight liveness and readiness endpoints. Readiness checks critical infrastructure without repeatedly calling paid store APIs. Correlate request ID → import/collection run → observation → alert event → notification ID in traces.

                                    Dashboard metrics: queue age/depth, source successes/errors/quota, eligible fresh-offer coverage, out-of-order rejections, match-review backlog, data-expiry purges, triggered alerts, delivery delay/failures, search latency, user errors, and spend. Trigger operational notifications on sustained actionable conditions, not on every single transient retry.

                                    Initial service objectives: 99.9% web/API availability, p95 eligible alert event to provider acceptance under two minutes when the notification service is healthy, and 95% of watched contexts refreshed within their configured interval plus ten minutes when source quotas and availability allow. Track source outages separately. A two-minute delivery objective is not a promise to detect a store change within two minutes.

                                    Define recovery objectives against the purchased backup plan. Proposed production target: database RPO ≤15 minutes and RTO ≤2 hours, requiring suitable point-in-time recovery and a tested restore. If the selected plan cannot meet these, record its actual limits before launch. Restore into an isolated environment, disable old notification replay, reapply deletion/retention records, and reconcile work before resuming delivery.

                                    **21. Scale and cost model**

                                    Provider work, rather than page traffic alone, is likely to dominate cost. Use this calculation before setting update promises:

                                    `requests/day ≈ sum over source cohorts(listings × checks/day ÷ effective batch size) + discovery + retries`

                                    For 10,000 listings checked hourly, there are 240,000 listing checks/day. If every source operation supports an effective batch size of 10, the theoretical collection floor is 24,000 requests/day before discovery/retries. A batch size of 10 is an example, not an assertion about every selected provider. Per-store quotas must be checked separately. Delivery contexts can multiply the count.

                                    At one stored observation per check, that example produces about 7.2 million rows in a 30-day month. Measure actual row/index size and write load; do not assume a small managed database tier holds unlimited history. Store current offers separately, aggregate permitted history for charts, expire data according to rights, and use change-oriented compression only if coverage records still prove unchanged checks and gaps.

                                    Suggested refresh allocation: spend the largest share on watched contexts, coalesce shared watches, use batches, and reserve discovery capacity. If quotas are insufficient, either purchase a suitable source plan, reduce coverage, or increase the transparently displayed check interval. Server autoscaling does not increase a retailer’s API allowance.

                                    Published starting points checked on 4 October 2026: Vercel Pro displays $20/month; Supabase Pro starts at $25/month; Resend Pro displays $20/month for 50,000 emails. Usage, seats, database recovery, extra projects, taxes, and add-ons can increase these amounts. [Vercel pricing](https://vercel.com/pricing), [Supabase pricing](https://supabase.com/pricing), [Resend pricing](https://resend.com/pricing)

                                    Use an initial planning allowance of approximately US$100–300/month for modest-traffic infrastructure, worker/Redis, email, and basic observability, excluding price-data licensing, significant model use, SMS, higher backup requirements, taxes, and domain fees. This is a budget assumption, not a supplier quote or a capacity guarantee. A verified source quotation is required before estimating the total business operating cost.

                                    Model cost separately: ambiguous new/changed listings × permitted input/output tokens × selected model tariff. Do not run an LLM on every price check. Model budgets, store quotas, email volume, database growth, and queue backlog must have visible operating limits and reporting.

                                    Scale web and worker replicas independently. Split queues by provider/work type, add indexes based on query plans, and introduce a dedicated search index or additional analytical storage only after measured thresholds justify it. The domain contracts already permit those changes without redesigning the customer experience.

                                    **22. Implementation work contract — one continuous build**

                                    The builder executes all of the following as one integrated assignment, handling dependencies internally rather than requesting approval after each component:

                                    - Initialize the monorepo, pinned dependency set, environment validation, formatting, CI, and shared contracts.
                                    - Implement the design tokens and all UI states against realistic synthetic fixtures; fixtures clearly identify demo data.
                                    - Write the database migrations, seed categories/attribute rules, ownership policies, repositories, and transaction helpers.
                                    - Connect authentication, account settings, session recovery, and continuation of a saved intent.
                                    - Implement adapters, source policy configuration, URL resolver, collection ledger, durable scheduling, and normalized ingestion.
                                    - Implement canonical search, import operations, matching proposals, deterministic acceptance, and operator review.
                                    - Implement offer eligibility, current-price projections, API endpoints, product comparison, and recorded history.
                                    - Implement watchlists, versioned target rules, state evaluation, transactional outbox, notification channels, and delivery reconciliation.
                                    - Connect the operator console, telemetry, source outage controls, retention jobs, export/deletion, and recovery tooling.
                                    - Run the correctness/browser/load checks below; fix defects; provision the approved environments; configure external services; verify actual live source journeys; deliver the repository, deployment, and runbooks together.

                                    The dependency order exists inside implementation, but the deliverable is the complete functioning system. A static mockup, decorative dashboard, or demo with hard-coded store prices does not satisfy it.

                                    **23. Verification and acceptance criteria**

                                    The core test suite must cover business failure modes, not only component rendering:

                                    | Scenario | Required result |
                                    |---|---|
                                    | Same model, different storage/RAM | Not merged as the same selected variant |
                                    | Same title, different pack/bundle/condition | Excluded from exact comparison |
                                    | Missing required identity field | Pending candidate or review, not auto-accepted |
                                    | Cheaper item plus higher known shipping | Known payable totals determine the delivered-price winner |
                                    | Shipping unknown | No invented zero delivery charge or unconditional delivered-price claim |
                                    | Bank discount or exchange estimate | Clearly conditional; excluded from default winner/target |
                                    | Only one source works | Useful partial result with source status and no false two-store claim |
                                    | Old observation arrives last | Cannot replace a newer authoritative current state |
                                    | Provider serves old data in a new response | Freshness reflects the underlying observation |
                                    | Source outage or expiry | Expired price hidden from current ranking and alert evaluation |
                                    | Target exactly equals price | Triggers for at-or-below rule, not strict-below rule |
                                    | Retry of collection/evaluation/outbox | No duplicate logical observation or target-met event |
                                    | Email accepted, response times out | Delivery reconciliation minimizes duplicate sends |
                                    | Price remains under target | One episode, not one alert every check |
                                    | Stale period between two low prices | Does not re-arm an episode |
                                    | User pauses/unsubscribes before dispatch | Delivery suppressed |
                                    | Price rebounds while email queued | Revalidation prevents a misleading late alert |
                                    | User A guesses User B’s list/rule ID | API and database policies deny access |
                                    | URL redirects to local/private host | Import rejected without network access to that destination |
                                    | Redis queue is lost | Durable database work recovers without duplicate business events |
                                    | Bad match is corrected | Current comparison, history assignment, and pending alerts reconcile |
                                    | Retention permission ends | Affected content, derivatives, caches, and queued payloads expire correctly |
                                    | Database restore | Deletions/expiry reapplied; already-delivered alerts not blindly resent |

                                    End-to-end browser acceptance covers searching, importing both supported store links, variant selection, comparing offers, Google/email sign-in, saving a list, editing a target, receiving a permitted test notification, following a store link, unsubscribing, and reporting incorrect data.

                                    Review at mobile widths from 360 px, tablet, laptop, and wide desktop; include keyboard-only navigation, reduced motion, slow network, failed images, long product names, large INR values, and empty histories. Test current Chrome, Firefox, and Safari/WebKit behavior.

                                    Initial load profile: 50 search reads/second plus 10 product reads/second for 15 minutes against a representative catalog, with a concurrent collection batch and a concentrated alert fan-out. These are test targets, not capacity claims. Record the environment, cost, latency percentiles, queue lag, error rate, and bottlenecks; tune until the agreed targets are met.

                                    The release is accepted only when real approved sources return validated data, every customer journey is connected, scheduled collection updates a graph, a qualifying observation causes the correct notification, ownership tests pass, operational visibility works, and deployment/restore procedures are reproducible. Document any remaining external block plainly instead of marking the live product complete.

                                    **24. Builder orchestration and access**

                                    Codex can coordinate parallel work on UI, database/API, providers/workers, and independent verification when those tools are available. Establish shared schemas and interface ownership first. Use isolated branches/worktrees, explicit file ownership, and one integration owner. Database migrations and contract changes require coordinated integration so parallel agents do not implement incompatible assumptions.

                                    Other named AI tools can help only if they are actually connected or you provide usable access. Their availability should not be assumed. The coding workflow should assign tasks by capability, retain meaningful review, and integrate one tested result; it should not call several models merely to increase apparent sophistication.

                                    Your authorization supports autonomous implementation of routine choices inside the agreed project. It does not create missing retailer permissions, vendor accounts, payment methods, or credentials. Keep secrets in provider configuration rather than chat or source control. The requested account protections, price correctness, and delivery deduplication remain part of professional engineering quality.

                                    **25. Inputs needed for the eventual live build**

                                    No further input is needed to use this plan. Before live integrations and deployment, supply or connect:

                                    - Final brand/domain, or permission to retain a temporary development name.
                                    - GitHub repository/organization and deployment accounts.
                                    - The price-data provider(s), working credentials, actual quotas, and agreements covering this product’s features.
                                    - Supabase project and selected region; worker/Redis hosting; Google OAuth application.
                                    - Email sending domain/provider and a support address.
                                    - Matching-model API credentials if that optional automation path is activated; deterministic matching and operator review still operate without them.
                                    - A stated monthly operating budget and expected launch traffic/catalog. The US$100–300 allowance above is only a planning default, not authorization for unlimited purchasing.

                                    The largest unresolved item is the price-data agreement. Brand styling, repository structure, schema, UI, deterministic logic, fixtures, tests, and local operation can all be implemented while that is resolved. Commercial launch claims cannot precede it.

                                    **26. Later additions that the architecture already accommodates**

                                    Phone authentication attaches through Supabase identity providers with verified account linking. SMS/WhatsApp/web push attach through `NotificationProvider`. A conversational shopping assistant reads the same canonical catalog and comparison services and cites recorded observations; it cannot independently make up prices. Embeddings or another model attach through `MatchingModel` where source rights allow.

                                    Three.js or React Three Fiber can add a lazy-loaded brand scene or a product interaction using properly licensed assets. Keep it off the critical search path and provide a static/reduced-motion fallback. A professional feel begins with typography, imagery, spacing, and responsiveness; 3D is an optional presentation layer.

                                    More stores implement the source adapter contract. More categories provide attribute schemas and matching evaluations. A mobile app consumes the versioned API. Paid memberships can add entitlement services later without mixing billing logic into price eligibility.

                                    **27. Final handover contents**

                                    Deliver source code; database migrations and synthetic seeds; connected web and worker deployments; configured source adapters; API documentation; data dictionary; design tokens and components; test reports; matching evaluation; source-capability inventory; cost model; deployment and rollback instructions; restore evidence; operational dashboards; and a concise account/credential ownership inventory without secret values.

                                    The finished experience must support this full chain: search or paste a link → identify the exact variant → see trustworthy matching offers → inspect recorded history → save a target → scheduled collection observes a qualifying price → receive the correct alert → buy at the selected retailer. Every displayed price and every sent alert must be explainable from its source observation.

````
