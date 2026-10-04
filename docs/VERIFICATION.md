# Verification record

Run on Windows with Node 24.19.0 and pnpm 11.19.0, 4 October 2026.

## Executed

| Check                                      | Result                                                   |
| ------------------------------------------ | -------------------------------------------------------- |
| TypeScript strict type check               | Passed                                                   |
| Next.js optimized production build         | Passed                                                   |
| Vitest domain and SQLite integration tests | 57 passed                                                |
| HTTP API smoke suite                       | 14 passed                                                |
| Consistent SQLite backup                   | Created successfully                                     |
| Read-only backup integrity verification    | `integrity_check=ok`, eight products, no delivery replay |

Domain/database scenarios cover conflicting storage/RAM/color/condition/pack, unknown identity fields, delivered totals, unknown shipping, ties, stale and future observations, source permissions, precise target equality, repeated low-price episodes, cooldown and distinct-observation re-arm, pause/resume, source outage, isolated ownership, malformed inputs, supported URLs, private/unsupported URLs, duplicate collection runs, out-of-order observations, unsubscribe suppression, stale queued triggers, price rebounds, logout, and account cascade deletion.

HTTP checks exercise the running application, including the same-origin regression found and fixed during browser testing. They create isolated demo profiles, verify watch/rule isolation, receive an in-app alert, reject malformed targets/imports, deny uncredentialed operator writes, and export only the active account's data.

## Browser checks performed in the Codex browser

- Home and search rendered with the synthetic environment label.
- Searched `Sony` through the mobile input and reached the matching product.
- Opened the Pixel detail, entered a ₹60,000 target, created a QA demo profile, verified the typed target survived, saved it, and observed the delivered in-app notification on Alerts.
- Session state remained available after reload/navigation; saved target appeared in the navigation count.
- Product comparison control and comparison view worked.
- At 360 px, the home and product pages had no document-level horizontal overflow after fixing a decorative orbit.
- At 1440 px, the desktop homepage had no document-level horizontal overflow.
- Improved secondary-copy contrast and added a skip link, modal focus trapping, Escape dismissal, and reduced-motion rules. These changes do not constitute a full WCAG audit.
- A hot-reload-only effect dependency warning appeared during editing; the page was reloaded after the change. This was not a production runtime assertion.

Preview: `docs/previews/home-desktop.jpg`.

## Authored but not executed in this session

`tests/e2e/journeys.spec.ts` contains a Playwright suite for search/details/history, target/profile continuation, persistence, pause/resume, mobile overflow, and an axe accessibility smoke check. `playwright.config.ts` defines Chromium, Firefox, WebKit and mobile projects.

To run these independently, install the browsers (`pnpm exec playwright install`), keep the web application and worker running, then run `pnpm test:e2e`. These test definitions are not reported as passing without execution.

## Not verified / not claimed

- Actual Amazon/Flipkart collection, live matching precision, retailer purchases or affiliate attribution.
- Google/email sign-in, external email delivery, webhook reconciliation, production admin MFA.
- PostgreSQL/Supabase RLS, Redis recovery, distributed scheduler leases, source revocation/retention purges.
- Docker build/run (packaging supplied; no local Docker validation performed).
- The blueprint's 5,000-variant, 50-search/10-product-reads-per-second, fifteen-minute load profile.
- Production RPO/RTO, deletion reconciliation following restore, complete accessibility conformance, or cross-browser acceptance.

The live release is not accepted by the blueprint's criteria. See `STATUS.md` for the remaining engineering and external dependencies.
