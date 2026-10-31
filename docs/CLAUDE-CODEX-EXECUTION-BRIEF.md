# Price Atlas: proposed execution brief

Prepared 30 October 2026 from nine supplied chats (eight unique), repository inspection, earlier live checks in this conversation, and official documentation. This is a planning handoff; implementation is paused. Incorporate later chat batches before treating this as final.

## Objective and baseline

Reach 2,500 distinct, evidence-backed base products with better category coverage; make Google sign-in and free notifications work for the actual user; grow useful, correctly dated history. Keep complete 7/30-day history as a separately measured requirement, not a promise implied by catalog size.

Earlier checks found 423 catalog products, 21 fresh eligible offers, enabled Google login, and a registered Telegram webhook with a matching hosted secret. These are time-specific results, not acceptance. The user reports **Connect Telegram generates no link** and confusing **Supabase email information**. Reproduce these exact symptoms first.

The automatic expansion currently discovers only Nykaa lipstick/makeup/skincare sections. The 349 bulk-verified figure describes that importer; it does not prove the other 74 products are unverified. Inspect evidence before reclassifying anything. Existing URL imports, matching, budgets, archive safeguards, history labels and notification outboxes should be extended rather than rebuilt.

## Scope commitment: sequencing does not remove features

The user wants expansion and experimentation, not a reduced classroom-only product. All requested features below remain in scope. A pilot establishes how to implement a feature; it is not permission to drop it. Report a concrete blocker and alternatives when necessary. Do not replace the requested 2,500-product outcome with a smaller demo catalog or restrict requested Gmail delivery to the developer's inbox without discussing that change.

| Requested outcome                           | Required work and completion evidence                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 2,500 products across categories            | Expand source discovery and verified imports; audit distinct base products, variants, category balance and freshness separately      |
| Robu.in and specialist retailers            | Dedicated source evaluation and integration workstream below, beginning during catalog pilots                                        |
| Free Gmail notifications for opted-in users | Implement a hosting-compatible sender, authorization/setup guidance, bounded delivery and real recipient/opt-out tests               |
| Google sign-in and Telegram                 | Fix the reported account/link experience and prove persistence, actual receipt and disconnect                                        |
| Complete 7/30-day history                   | Collect forward and recover dated evidence; report completion per product and window, with broader coverage progressing continuously |
| Gemini-assisted arbitrary-product search    | Implement bounded query refinement and source discovery with verified extraction and a non-AI fallback                               |
| Frankfurter exchange-rate references        | Implement cached dated conversions with native amounts and international separation preserved                                        |
| Real pincode/serviceability checks          | Pilot a retailer-specific check, then expand supported adapters; distinguish unknown from verified deliverability                    |
| Browser push                                | Implement opt-in, subscriptions, delivery, device testing and opt-out as a requested channel                                         |
| Full disaster recovery                      | Test application database, managed Auth, storage, configuration and worker recovery; identify unresolved dependencies explicitly     |
| Catalog performance                         | Database pagination, narrow initial downloads and representative 2,500-product performance checks                                    |
| Week-long reliability and teacher testing   | Actual collection/notification evidence plus manual device and accessibility testing                                                 |
| HyperFrames demo/preview video              | Retain as a deliverable after the demonstrated flows are ready; record real behavior and label simulations                           |

## Execution order and acceptance

| Order          | Work                                                                                                  | Evidence required to finish                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1              | Diagnose Google/session, Telegram link generation, and the confusing email flow                       | Actual Google consent, correct account, target save surviving reload; generated Telegram link, Start, saved connection, received test alert, disconnect and suppression |
| 2, alongside 1 | Back up and start a balanced 30–50-product daily history cohort                                       | Restorable application backup; successful dated prices and separate failed-check logs; daily coverage report                                                            |
| 3              | Probe existing sources, Robu.in and category specialists; build a balanced, resumable importer        | A bounded pilot in weak categories, measured net additions, source failures, deduplication and request/credit report                                                    |
| 4              | Scale through 500 → 1,000 → 2,500 verified base products                                              | Audited counters and category coverage; pagination; no duplicate variants or discovery-only rows inflating the target                                                   |
| 5              | Enable a tested free Gmail route, then browser push                                                   | Authorized inbox receipt; push receipt on real devices; opt-out, expired subscription and retry behavior checked                                                        |
| 6              | Expand successful specialist-retailer pilots; implement Gemini search, FX and serviceability adapters | Separate acceptance for each feature below                                                                                                                              |
| 7              | Hosted recovery and a seven-day reliability run                                                       | Restore report, auth/storage results, measured collection gaps, credits and notification outcomes; manual teacher/mobile/accessibility checklist                        |

Do not wait for 2,500 before collecting history. Do not promise a completion date until a pilot measures successful new products per request. Elapsed days alone do not establish daily price coverage.

## Notifications: fix the existing path

Trace Connect Telegram from its click handler through authenticated `POST /api/v1/telegram`, response parsing, session/cookies, database/RLS and returned link rendering. Record sanitized HTTP/error details and verify the deployed version. Show an actionable error instead of a silent failure. Keep the existing Vercel webhook unless diagnosis proves a change is needed. Polling does not run while its host sleeps; Telegram also disallows `getUpdates` while a webhook is configured. [Telegram API](https://core.telegram.org/bots/api#getupdates)

Treat **Google OAuth**, **Supabase login/confirmation emails**, and **price-alert emails** as three separate paths. Determine whether “Supabase email” refers to a sender, error, account label or consent screen. Do not diagnose an email quota as the cause of Google OAuth failure without evidence. [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)

Free Gmail sending is possible without purchasing a domain. Prefer a dedicated sender authorized through Gmail's HTTPS API for the current hosting. Recipients do not need to grant access to their Gmail accounts. Use a small application sending cap, opt-in, unsubscribe, a durable outbox and conservative handling of uncertain sends. Keep Resend selectable for later. Gmail standard API usage is currently available at no additional cost within documented limits. [Sending](https://developers.google.com/workspace/gmail/api/guides/sending) · [Quotas](https://developers.google.com/workspace/gmail/api/reference/quota)

Do not blindly install SMTP on the existing free Render worker: it blocks outbound ports 25, 465 and 587. SMTP may be a local-worker option, with a separate uptime limitation. Gmail API setup requires operator consent; external OAuth apps in Testing generally issue refresh tokens lasting seven days for these scopes. Resolve the applicable publishing/verification and token-renewal requirements before claiming week-long reliability. [Render](https://render.com/docs/free) · [OAuth token expiry](https://developers.google.com/identity/protocols/oauth2)

Add browser push through the existing HTTPS origin using VAPID, a service worker and user-owned subscriptions. Include explicit opt-in, a test button, disconnect/account-switch handling, endpoint validation and expired-subscription cleanup. Test closed-tab delivery. iOS/iPadOS support requires the appropriate Home Screen web-app flow. Push still depends on a running sender. [WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

## Catalog: keep the goal, improve the importer

1. Audit distinct base products, verified variants/listings, fresh offers and discovery candidates separately. Preserve exact variant matching, but do not count every shade/size as a new base product merely to reach 2,500. Stale verified records may remain catalog entries; their prices must not appear current.
2. Run small canary checks across all ten retailers. Discover actual sitemap/category/feed locations; do not assume `/sitemap.xml` is available, useful or unrestricted. Test new sources, including **Robu.in if that is the intended store**, when they fill gaps. Do not require every blocked existing retailer to recover before testing a promising new one.
3. Accept local URL files and staged CSV/JSONL candidates. Reuse the existing JSON URL importer; add validation, category priorities, durable checkpoints, rejection reasons and dry-run reports. Metadata datasets supply identities, not verified Indian prices. Check attribution/reuse terms before choosing a dataset or feed.
4. Pilot roughly 20 candidates per weak category: books, laptops, monitors, home/kitchen, stationery and fashion. Queue product-page verification; prefer cached evidence where still valid, then direct fetching. Spend bounded provider credits only within the selected policy. A sitemap URL or search snippet is not a verified offer.
5. Prioritize underfilled categories and pause disproportionate beauty growth. Set the final category allocation from measured source yield; ensure quotas actually sum to 2,500. Do not delete useful existing products to make the mix look balanced.
6. Add database-backed pagination, category filters and narrow initial responses before scaling downloads. Keep raw evidence/reports locally with source URL, fetch/capture time, currency, variant identity and checksums; production PostgreSQL remains authoritative for the hosted app.

The repository currently hard-caps shared collection at **1,000 requests/day, 100 paid credits/day, 300/month, 10/request**. Local and hosted collectors share that ledger. More keys do not raise those caps. Any intentional capacity change must update policy, code and tests explicitly; do not use another machine or account to bypass it. Preserve lawful existing credential failover rather than discarding keys arbitrarily.

Budget by **listing fetch**, discovery, retry and alert workload—not just product count. Hourly targets can consume 24 attempts per listing/day. Reserve capacity for active targets and the history cohort, then allocate import capacity from what remains. Do not silently downgrade the existing hourly target cadence to six-hour checks.

## Robu.in and category-specific retailer expansion

This is a core catalog-growth workstream, starting with source pilots in step 3. It is not contingent on fixing every existing retailer or reaching 2,500 first.

| Source/category lane            | Investigation and intended integration                                                                                                                                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Robu.in**                     | Inspect actual product pages and discovery sources for robotics, sensors, development boards, motors, tools and electronic components. Verify which categories and data are available before selecting import batches. Add meaningful components/robotics classification where justified rather than putting everything in Other. |
| Books and education             | Identify specialist bookstores/publisher stores with exact ISBN, edition, binding and price evidence. Use metadata datasets to improve identification, not as retail-price substitutes.                                                                                                                                           |
| Computers and peripherals       | Investigate specialist computer stores for laptops, monitors, parts and accessories, preserving exact model/specification and warranty context.                                                                                                                                                                                   |
| Home, kitchen and appliances    | Investigate brand-direct and specialist stores; preserve capacity, model and pack quantities.                                                                                                                                                                                                                                     |
| Fashion and accessories         | Evaluate sources with identifiable styles and selected size/color prices. Keep variant ambiguity explicit rather than abandoning the category.                                                                                                                                                                                    |
| Stationery and student supplies | Investigate calculator, office-supply and art-supply stores with model or pack identifiers.                                                                                                                                                                                                                                       |
| Beauty and personal care        | Retain useful current sources and investigate brand-direct gaps without allowing this lane to dominate expansion.                                                                                                                                                                                                                 |

Produce a named retailer shortlist from actual research, with URLs and a comparison of category coverage, source terms, discovery options, identifiers, price/stock extraction, access failures and maintenance needs. These are investigation lanes, not claims that every retailer offers an API or accessible feed.

For Robu.in and each selected candidate:

1. Inspect a small representative set of real product URLs and available sitemap/category/feed discovery. Try direct retrieval first; evaluate bounded authorized provider fallback where useful.
2. Record evidence for title, identity, selected variant, currency, price and stock; leave shipping and serviceability unknown unless verified.
3. Implement retailer URL validation, canonicalization, extraction, matching, category routing and relevant search integration. Add fixtures for ordinary, unavailable, ambiguous and blocked pages.
4. Pilot around 20 product URLs, recording new verified products, duplicates, failures and credits. This sample measures feasibility; it does not guarantee long-term access.
5. Connect successful discovery to the resumable category-prioritized importer. Reuse shared budgets, deduplication and monitoring.
6. Publish actual coverage and health. Scale promising sources without waiting for all ten original retailers to succeed. If a candidate fails, document why and research an alternative in that category.

Local datasets, saved evidence and user-supplied URL lists remain valid sourcing routes. Additional legitimately available Firecrawl/ScrapingBee credentials may help retrieval within an explicitly chosen budget; neither reject them categorically nor assume they solve every block.

## History and remaining features

- **History:** revalidate the two earlier Sony captures against current identity, provenance, report-digest and retention checks; import only if accepted. The latest validated file currently contains zero observations, while an older artifact contains Sony entries. Do not bypass safeguards or assume an import bug. Run bounded archive batches and measure yield. Store real captures as history-only; blocked/OOS checks without prices are collection events, not daily price points. Measure exact IST-day coverage in the displayed 7/30-day window. Never fill missing days with repeated prices.
- **Gemini/search:** local exact lookup first; optional bounded spelling/intent refinement with protected model/ISBN/variant tokens, caching, timeouts and a non-AI fallback. AI may locate sources or propose extraction; accepted facts require retained source evidence and deterministic validation. Browsing agents are not forbidden from finding real evidence, but model assertions are not evidence.
- **Frankfurter:** not implemented merely because native currencies already work. Add dated, cached exchange-rate references independently of search/history. Preserve native amounts; converted INR is indicative and excludes shipping/customs. Keep international offers outside domestic ranking and alerts. [Frankfurter](https://frankfurter.dev/)
- **Pincode:** investigate one retailer-specific, permitted serviceability check. Return supported/unsupported/unknown with listing, seller/variant, pincode and timestamp context. Postal-address validation does not prove delivery. Keep checkout disclosure where no reliable check exists; do not declare universal serviceability complete.
- **Recovery:** restore into isolated hosted PostgreSQL with all outbound sends disabled. Verify tables/checksums, constraints, RLS, saved targets and worker recovery. Test managed Auth identities/provider configuration and storage objects separately; “users log in again” is not a complete Auth recovery strategy. Protect backup keys separately. Send only an explicitly authorized test after isolation checks.
- **Reliability/demo:** run seven actual days, record gaps and notification failures, and complete manual device/accessibility checks. A labelled simulated test proves channel behavior, not a real market price drop. Defer HyperFrames video until this path works.

## Suggested Claude/Codex ownership

**Codex:** auth/Telegram diagnosis, provider adapters, importer and budgets, Gmail/push delivery backend, history ingestion and recovery tooling.

**Claude:** Settings/error/link/test UX, category coverage and paginated browsing UI, history coverage/provenance presentation, mobile/accessibility acceptance.

Agree API contracts first. Use separate branches/worktrees and one integration owner; do not edit shared files concurrently. Each handoff must state changed files, tests, deployment status, real evidence and remaining user actions. Human consent and inbox/device receipt remain explicit acceptance steps. This division is a proposal, not a dispatch to other chats.

## Do not carry forward these claims from the supplied chats

- Guaranteed free 2,500-product timelines, universal sitemap access, or exact free-tier credit quantities without checking the actual accounts.
- “349 bulk-verified means 74 fake products,” “local requests are outside the shared quota,” or “Frankfurter already works.”
- “Gmail cannot send to other users without a custom domain,” or “Gmail SMTP will work on free Render.”
- “Switch to polling/create a new bot” as a substitute for diagnosing the missing link.
- “Two archived points complete a week,” “failures count as price days,” or “remove the archive gate until import succeeds.”
- Quietly redefining 2,500 verified base products as 2,500 names, weakening freshness, fabricating history, or shipping every suggested new feature before proving the core flow.
