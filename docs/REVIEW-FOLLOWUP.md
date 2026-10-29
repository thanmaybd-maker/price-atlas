# Evidence and evaluator follow-up

29 October 2026. These changes follow the evaluator review and the request to research Roadside Coder, Flash, Tapju and Spoken.

## What changed

- The catalog status distinguishes all catalog products from products verified by the bulk importer. The observed 423 and 349 counters refer to different sets, not competing snapshots. Both are labelled with the time the counts were read; the bulk progress counter excludes other import paths.
- One eligible offer says “1 recorded offer”, without a multi-store savings or cheapest-deal claim.
- A shared discovery guard rejects explicit model, capacity, binding, pack-size and accessory conflicts. Kobo cases and a different Kobo model cannot survive on keyword overlap alone. Search-cache identity was bumped to prevent older unfiltered discovery results from being reused.
- Each supported retailer has an outcome, including not checked, source blocks, no results, partial discovery, or an eligible recorded offer. Registry support never implies that all ten stores were contacted. Timestamps and collection methods accompany observed results.
- Offer evidence exposes the retailer URL, absolute observation time, price basis, extraction method and parser version. Older observations without method metadata say so; the current product's metadata is not retroactively assigned to an older observation. CSV exports retain the same provenance.
- The target picker initially contains only its selected/saved entries. Focusing the picker searches recorded products through a bounded endpoint, without retailer scraping, and it renders at most 25 options including the current selection. Requests are debounced, cancelled on changes and retryable; the selected product survives a new filter. Home list payloads omit detailed specifications while preserving identity, source and eligibility attributes. Detail and comparison routes retain the full records.
- History is labelled “Recorded history · last 30 days”. Coverage still means actual observed days, with no fabricated backfill.

## Firecrawl integration and failover

[Roadside Coder's source project](https://github.com/piyush-eon/smart-product-price-tracker) uses Firecrawl and scheduled collection. Price Atlas keeps its existing parser, matching, persistence and budget protections while adding Firecrawl's [documented scrape API](https://docs.firecrawl.dev/api-reference/endpoint/scrape).

An explicitly submitted supported retailer URL tries free direct fetching first. Firecrawl requests fresh raw HTML, with the basic proxy, no AI extraction and no automatic proxy escalation. The current base cost is one credit. A real Sony WH-1000XM5 test returned ₹19,989 and its expected retailer identity. It did not invent a historical observation.

`FIRECRAWL_API_KEY` and optional `FIRECRAWL_FALLBACK_API_KEYS` stay in private local/Vercel environments. On provider authentication, quota, rate-limit or temporary network failures, a bounded attempt can move to another configured key. The working key remains preferred on subsequent requests. Authentication failures disable that fingerprint; exhausted Firecrawl keys cool down for six hours before eligibility is reconsidered. Temporary failures cool down for a minute. Retailer blocks, mismatched destinations and parser failures do not trigger key rotation. Only fingerprints and cooldowns enter the database.

All accounts share the same app ceilings: 1,000 source requests/day, 100 reserved provider credits/day, 300/month and 10/request. Failover does not reset them. Ordinary name searches and the scheduled worker remain free-only. No extra accounts are created and no automatic purchases are enabled. `pnpm check:firecrawl` checks configured balances without printing keys or scraping products.

## External history research

- [Tapju's FAQ](https://tapju.ai/) says historical tracking remains on its roadmap. Its [terms](https://tapju.ai/terms-of-use) do not grant a general right to scrape its dataset.
- [Flash's public product report](https://webapp.flash.co/product-details/mPkxIE03) illustrates per-claim source citations. No public licensed history API was verified. Its homepage returned HTTP 403 during inspection; a cited source does not establish that its underlying history can be republished by another application.
- [Spoken's product-page guide](https://www.spoken.io/blog/meet-our-redesigned-product-pages-a-smarter-way-to-shop) describes furniture comparisons, price history and similar alternatives. No unrestricted Indian-retailer history feed was established.
- [Keepa's chart-image API](https://keepa.com/api-docs/graph-image.html) is a documented integration route using an API subscription; calls must stay server-side to protect the key. [PriceHistory's terms](https://pricehistory.app/page/tnc) require permission for copying/framing and its [business page](https://pricehistory.app/page/business) offers custom services. Attribution alone does not supply that permission.

These services are references and potential licensed integrations. Their charts are not copied into Price Atlas's observation store. Current-page scraping builds history from checks made over time; adding a provider cannot supply dates it did not observe.

## Recovery evidence and remaining acceptance

`pnpm backup:restore-drill` takes a repeatable-read, read-only snapshot of the atlas application schema, persists an encrypted compressed backup and a separate key file under ignored `data/backups`, then restores that persisted backup into isolated PGlite. Each table's row count and SHA-256 content digest must match. No worker or notification sender runs against the restored outboxes.

The real drill restored 28 tables and 2,953 rows with matching counts and digests. This is an application logical restore into a PostgreSQL-compatible scratch engine. It excludes managed Supabase Auth, provider secrets, external storage and server-role recovery; it is not a completed hosted Supabase disaster-recovery exercise. Keep the backup key apart from copied backups. Never restore or dispatch old notification outboxes in production without reconciliation.

Real Google consent, save/reload on the evaluator's own account, Telegram Start, and an authorized received/opt-out notification remain human acceptance tasks. Fixture tests do not close them. The 2,500-product target and a complete month of per-product observations remain unfulfilled.
