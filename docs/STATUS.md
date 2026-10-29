# Current status

## 30 October archive integration

Claude's copied Wayback helper, bounded transport, launchers and history-only writer have been
reviewed against current main. Integration adds matching report digests, apply-time listing,
price, provenance and retention checks, CSV archive labels and original retailer URLs, and
capture citations in the 30-day table and both seven-day receipts. Archive points cannot become
current offers or trigger alerts. See [the archive procedure](./WAYBACK-HISTORY.md).

A read-only check from this Windows machine reached the archive and validated two Sony Amazon
captures on 11 and 12 October, both at ₹19,489. One other replay was a captcha; Flipkart timed out.
A separate six-listing category check returned no additional accepted prices, with 503s, timeouts,
out-of-stock and no-price pages. Its zero accepted count does not establish zero archive coverage.
These are bounded samples, not a complete search of all historical captures. No archive prices
have been written to the application database in this integration check. Sparse history remains
an explicit limitation; a full seven-day or thirty-day dataset has not been established.

## 29 October source evidence, discovery review and Firecrawl

The [review follow-up](./REVIEW-FOLLOWUP.md) implements explicit retailer outcomes, absolute offer evidence and extraction provenance, separate catalog/import counters, one-offer wording, stronger model/accessory discovery filtering and a bounded product picker loaded on interaction. Home metadata is smaller while detail routes retain full specifications. A same-catalog measurement compared 797,899 bytes on the earlier production Home page with 682,628 bytes on the candidate build; this is a specific HTML-size measurement, not a general latency guarantee. Valid ISBN-13 identities normalize across ISBN/GTIN fields while binding and edition remain decisive.

Firecrawl raw-HTML extraction passed a real one-credit-reservation Sony lookup at ₹19,989. All four configured credentials authenticated in the no-scrape balance check. Failover keeps a successful key preferred, uses cooldowns for provider failures, and never resets the shared request/credit ceilings. Fixture tests verify exhausted-key failover, provider separation, persistent fingerprint state and a denied shared allowance. Local validation passes 186 unit/integration tests, type checking and 16 release/review browser scenarios. CI and hosted verification follow publication.

The application logical restore drill verified 28 tables and 2,953 rows against encrypted backup contents in isolated PGlite, with no production writes or notification replay. Managed Supabase Auth, external storage and hosted-server recovery remain outside that drill. Human Google/Telegram acceptance is still pending. Claude's separate Wayback work has a [scoped handoff](./CLAUDE-WAYBACK-HANDOFF.md); unreviewed archive scripts and chart changes are excluded from this release.

## 29 October theme, paper targets and recorded-history repair

Hosted verification of the first repair passed the history smoke and ten live API checks. Its browser suite exposed a first-load theme race: a select could accept input before hydration attached its handler. Theme controls now remain disabled until ready, covered by a thirteenth browser scenario that deliberately holds JavaScript requests. The full hosted suite is rerun after this follow-up.

The [usability repair](./USABILITY-REPAIR.md) replaces the legacy target dialog with the shared sticky-note composer, preserves decimal rupees and explicit sign-in-return drafts, and confirms saves without a blocking session refresh. Light and Dark now cover the Home/Categories paper surfaces, account pages, product offers, forms and ring canvas. Public catalog reads coalesce without caching accounts; one bounded history batch replaces four product reads, with actual coverage, item/delivered selection, a daily table and visible retry states. Current product offers are read independently of the catalog cache.

Final local verification: 167 unit/integration tests, type checking, production build, all 12 release/usability browser scenarios and the real four-product history API smoke pass. Private browser actions use isolated fixtures; they do not prove real Google consent or recipient delivery. Publication/hosted checks are recorded separately. Retained observations remain sparse on October 6, 28 and 29; no missing days are filled. [Free-source research](./HISTORY-SOURCES.md) explains the independent tracker references and why their charts were not copied into our database.

## 29 October functionality and evaluator review

Follow-up after Claude's Home/Categories expansion: the tide chart now applies domestic INR, new-condition, accepted, in-stock, history-permitted and non-future observation guards before calculating daily lows. Alert previews say “recorded”, do not imply confirmed message delivery, and disclose that shipping depends on the saved target's basis. Cross-border category copy preserves the source currency rather than promising USD. The expanded suite passes 162 unit/integration tests. The deployed Home/Categories release passed all five release browser scenarios and ten live API checks before this follow-up.

The [15-perspective audit](./PROJECT-AUDIT.md) records strengths, defects, unnecessary additions and prioritized follow-ups. This release includes Claude's light ring hero, retains the lotus/neutral chips, adds ring pause and an immediate search-animation skip, and fixes product-page text contrast. History has independent item/delivered selection, CSV evidence download and shareable range/basis links. Unknown shipping remains unknown in both charts and CSV.

Model-prefix search errors and valid ISBN punctuation are covered by regression tests. Invalid page/category addresses and API suffix aliases return 404. Storage-denied browsers degrade safely. Visible tabs refresh recorded offers at most once a minute without reloading catalog metadata; hidden tabs pause and slow requests do not overlap. Health checks use a cheap database probe.

Verification: 160 unit/integration tests, TypeScript checking and production build pass. The new five-browser-scenario suite covers live-mode animation skip with a held factual response, neutral chips/mobile accessibility, invalid routes, no-WebGL/storage denial, and history CSV/sharing/basis. Automated accessibility checks do not establish complete manual accessibility compliance. Live API smoke passed ten checks without creating accounts or sending messages. Readiness reported 423 products in 15 categories, 236 fresh eligible offers, zero paid credits for the current collection day, enabled Google login and healthy Telegram webhook configuration. Counts and freshness change over time.

Outstanding: 2,500 verified products, a completed human Google consent/save/reload test, authorized Telegram receipt and a production PostgreSQL restore drill. Retailer blocks, shipping serviceability and free-host availability remain external limits. No extra paid API was added. Current procedures are in [operations](./OPERATIONS.md).

## Existing functionality and constraints

Telegram and in-app alerts are the selected no-domain channels. Email is explicitly unavailable by default (`EMAIL_DELIVERY_ENABLED=false`); the Settings control is disabled and the API rejects email opt-in until an operator verifies a sender and enables it. Disabling email delivery does not disable eligible in-app or Telegram alerts.

The latest functional release centralizes ten retailers, adding Reliance Digital, Myntra and AJIO. A free primary-page request verified and imported a Reliance Digital iPhone 16 listing; this does not confirm delivery to a specific pincode. Structured Product/Book data, bounded framework JSON and canonical meta fallbacks retain explicit partial states. Pack sizes, binding, edition, model, capacity, memory, shade and condition participate in conservative matching. Cross-border offers, including international stores quoting INR, cannot win domestic rankings or trigger domestic alerts. No fixed customs percentage or exchange-rate estimate is invented.

Search uses relevant retailers, direct pages, DuckDuckGo and an additional free RSS discovery fallback; every external request counts toward the shared allowance. Recorded matches and repeated cached searches avoid paid calls. The browser supports additional free discovery, explicit URL verification, shareable queries, eight local recent entries, product pagination and price filtering when shipping is unknown. The weekly ledger uses India dates, actual daily highs and lows, and no change across an unobserved previous day. Claude's styling remains in place.

The catalog remains below 2,500 verified base products. Nykaa blocked subsequent catalog/product requests, which are deferred until their retry windows; the persisted hosted worker can resume them. The public catalog-status endpoint exposes the next attempt time. This is an outstanding data-collection dependency, not a completed import. Public email still requires a verified Resend sender domain; Google consent and Telegram Start/recipient confirmation require human action. Refer to the teacher checklist before claiming presentation readiness.

Public Supabase accounts, retailer URL imports, PostgreSQL history, exact variant matching, target rules, email and Telegram outboxes, operator MFA and isolated test alerts are implemented. Retailer tracking enables history and alerts by default. Demo products remain separate and synthetic.

Public product-name and retailer-URL lookup now discovers products outside the saved catalog without requiring sign-in. Verified details support arbitrary product types under a conservative generic category; cross-store matching still requires decisive attributes. Searches use direct retailer fetching, a free web-search fallback and the configured paid provider, with shared query caching and transactional credit budgets. No synthetic live prices or history are created.

Real name searches have returned verified mouse, electric-kettle, book, calculator and iron details outside the initial catalog. Daily display and hourly alert freshness are separate. Direct fetching remains available when the paid-credit allowance is exhausted.

Google authorization redirects to the configured Google consent endpoint. Production Telegram webhook registration and hosted-secret verification pass. Actual sign-in and a user's Telegram Start/alert receipt still need human interaction. Resend has no verified sender domain, so public email alert delivery remains limited to its sandbox. The hourly GitHub workflow resumes the Render worker without copying credentials into GitHub; its wake check passed. Its independent collector remains opt-in. Free hosting and delayed schedules do not guarantee uninterrupted hourly collection.

The source registry now includes Amazon.in, Flipkart, Meesho, Croma, Nykaa, iHerb and B&H. Free live requests verified Meesho, Croma and Nykaa product details; iHerb succeeded through the configured fallback. B&H direct and standard-proxy checks failed and must be treated as unavailable until a successful response is verified. Name discovery is best effort for every source; retailer filters and direct URLs are supported. Nykaa shade identity is checked against the selected variant payload. Meesho listing prices can vary by size. Unknown condition, stock and shipping remain unknown. Foreign-currency prices are metadata only, excluded from INR comparisons/history/alerts. International shipping depends on the item and checkout; no landed-cost estimate is invented.

CI uses Node 24 and the pinned pnpm release directly; both verification and Render wake workflows passed. Ordinary name searches and scheduled collection now use free fetching only. Explicit single-product URL verification can use up to ten paid credits, with account failover inside that same ceiling and the shared daily/monthly budgets. Account state stores fingerprints only. Exhausted/invalid accounts are skipped; temporary provider outages trigger a one-minute cooldown. Retailer CAPTCHA and parser failures do not cycle accounts.

Category routing distinguishes the primary product from compatibility/bundle text. The iPhone mentioning AirPods belongs in Phones; the Motorola Pad bundled with a keyboard belongs in Tablets. Beauty, personal care, home/kitchen, appliances, accessories, fashion, books, stationery and services have main categories. The category and failover release passed production checks and CI.

The free catalog expansion persists category cursors, deduplicated parent IDs, verification leases and quota pauses in PostgreSQL. Actual verified lipstick brands include Lakme, Blue Heaven, Kay Beauty, RENEE, Swiss Beauty and L'Oreal; shade and size evidence is retained. Listing-page prices are never imported. The running target is 2,500 distinct base products, not a completed count. Bulk listings retain a weekly cadence; enabled targets retain hourly scheduling. The shared 1,000-request daily ceiling remains in force. See [catalog expansion](./CATALOG-EXPANSION.md) and [backend contract](./BACKEND-UI-CONTRACT.md).
