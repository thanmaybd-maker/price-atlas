# Copy this task to Claude: Wayback history only

Continue the Internet Archive backfill on your `feat/wayback-history` branch. Codex is handling the main application review and Firecrawl integration. Work in your separate checkout. Do not switch branches, stage, commit, reset or replace files in the shared Windows project while Codex is working. Do not include Codex's uncommitted changes in your commits.

## Your scope

You own `scripts/backfill-wayback.ts`, `run-history-backfill.bat`, a new archive-specific pure helper module if necessary, focused archive tests, and archive documentation. Provide a small separate patch for any shared chart/type/package changes so Codex can integrate them deliberately.

Do not edit `atlas.tsx`, `home-worlds.tsx`, the retailer registry, API routes, general scraper/parsers, provider keys, Firecrawl transport, shared credit budgets, theme CSS, or database migrations without first reporting the exact requirement. Codex has already edited `package.json` and `tides-world.tsx`; do not replace those files with your branch's versions. Preserve `Smart-Shopping-Blueprint.md` entirely. Never copy `.env`, API keys, database credentials, encrypted backups or their key files into your chat, artifacts or Git.

## Objective

Find real historical prices in archived copies of supported retailer product pages, with exact product identity, an actual capture timestamp, and a verifiable snapshot URL. Store only validated, history-only observations. Availability and coverage are unknown until measured. CDX records locate archived pages; they do not themselves contain verified prices.

Keep our own observations and archive evidence distinguishable. No invented values, backward-filled current prices, interpolated missing days, third-party tracker chart extraction, current-price promotion, or alert evaluation.

## Audit and repair the current script before any write

1. **Reachability first.** Make one short bounded request to the public CDX endpoint from the execution environment. Distinguish network timeout, HTTP 403/429/5xx, malformed response and a successful empty result. If unreachable, stop with an actionable report instead of looping over 60 products and printing misleading zero coverage. Do not change system DNS/firewall, bypass access controls, introduce proxies or spend Firecrawl credits for this task.

2. **Validate CDX rows.** Require a valid 14-digit UTC capture timestamp, a supported retailer URL, matching store and exact listing identity, successful HTML capture, and a time inside both the requested range and the retailer's permitted retention window. Reject malformed dates that JavaScript would otherwise normalize. Reject future captures. Prefix search must not accidentally include another listing. Normalize HTTP versus HTTPS for identity comparison without making a live-retailer request.

3. **Avoid wrong-date/live fallback.** The current fetch helper follows redirects by default. A replay can redirect to another capture time or to a live page. Do not label that result with the originally requested CDX timestamp. Prefer strict archive-only replay with bounded redirect handling and explicit capture verification; reject a redirect when its provenance cannot be proved. Check the final host, capture identity and any relevant archive timestamp headers. Never silently fetch today's retailer page as historical evidence.

4. **Bound every operation.** Pace all archive requests, use a truthful User-Agent, enforce request timeouts, response size/content-type limits and a small retry ceiling. Honor rate-limit signals. Bound product/capture totals. Avoid body leaks on failed/retried responses. Reuse validated snapshot results between a dry run and apply when practical instead of doubling all requests.

5. **Separate candidate and validated coverage.** The current dry run counts CDX days without parsing their pages. Label those as candidate capture days. Report independently: indexed captures, fetched snapshots, parseable price snapshots, exact-variant accepted observations, observed India dates, and skip/error reasons. A report saying seven days of history must mean seven days with usable prices, not seven CDX entries. If full validation is optional, clearly distinguish index-only and validated dry runs.

6. **Match exact variants.** Verify canonical store/listing ID and, where available, the stored listing's decisive attributes against the archived page: ISBN/binding/edition for books; brand/shade/size for cosmetics; model/storage/memory for devices; pack count and condition. Source listing attributes are stored in listing evidence. Reuse existing pure match helpers without relaxing them. Missing decisive evidence stays unverified and is skipped. Captcha/challenge/error/partial pages cannot create accepted prices. Do not make unknown shipping zero or unknown stock true.

7. **History-only writes.** Apply only after the reviewed dry-run report. Use idempotent observation IDs and explicit INSERT column names. Keep the capture timestamp and source URL. Set alertsAllowed=false and displayAllowed=false, with no current_offers/listing scheduling/price ranking updates, collection evaluations or notification dispatch. Validate the target listing still belongs to that product and remains accepted at write time. Prefer a bounded transaction per product. Protect existing observations and source retention rules. Reject incompatible currency and cross-border observations from domestic history.

8. **Evidence.** Preserve the original retailer URL separately from the archive snapshot URL. Record that extraction came from archived retailer HTML, including parser version. Do not describe the archive capture as a price verified live by Price Atlas. Charts, CSV and accessible tables must make archive provenance inspectable. Supply small shared-file patches for Codex to review rather than editing shared UI files in place. Never replace a more recent primary observation with an archive point.

9. **Launcher.** The batch launcher must stop if dependency installation or the dry run fails. Use the pinned package manager and frozen lockfile. Keep its “Type yes” write confirmation. Explain whether the report describes indexed captures or validated prices before that prompt. Do not automatically type confirmation or apply a backfill just to obtain a successful demo.

## Required tests

Use fixtures; tests must not contact live archives or Supabase.

- Wrong store/ASIN/product ID from a prefix search is rejected.
- Wrong model, pack size, storage, shade, book binding or edition is rejected.
- Missing decisive identity stays unverified.
- HTTP originals can be identified without following a live redirect.
- Redirect to another capture or live host cannot become a dated price silently.
- Invalid/future/expired timestamps are rejected.
- Captcha, empty HTML, missing price, stock uncertainty and malformed CDX JSON remain distinct outcomes.
- Unknown shipping remains null; currency stays original.
- A successful empty CDX response differs from an unreachable archive.
- An exact, dated fixture produces an idempotent history-only observation with evidence.
- Re-running apply adds no duplicate rows and cannot create current offers, eligible alerts or messages.

## Run/report sequence

First audit the code and run fixture tests. Then report network reachability. If reachable, run a small dry check for the known Sony product `amazon-b09xs7jwhh` (Amazon ASIN B09XS7JWHH), followed by a bounded sample of books, calculators, phones and cosmetics. Do not assume popular products have captures.

Return a machine-readable report plus a concise table of indexed days versus validated price days, request/error totals, parser/matching rejection reasons and source URLs. A zero-result report is acceptable when truthful. Do not claim a month of history or “every archived point is a real price” without evidence.

Leave production writes pending until the actual report has been reviewed. Provide your commit SHA and a patch/bundle limited to your scope. Confirm exactly which files you copied to the Windows folder and whether any shared-file edits remain as separate patches. Codex will integrate and publish the reviewed result with the application release.

## Codex's concurrent work — leave intact

Codex is completing retailer outcomes, offer source evidence, distinct catalog/import counters, single-offer wording, Kobo/accessory discovery conflicts, a lazy target picker, smaller Home metadata, Firecrawl transport and automatic provider-key failover, application-data restore diagnostics, and associated browser/unit tests. Firecrawl secrets are already private server configuration. No provider credentials are needed for Wayback collection.
