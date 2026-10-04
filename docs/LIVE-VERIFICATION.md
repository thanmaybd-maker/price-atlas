# Verification — 4 October 2026

- PostgreSQL and TCP Redis connectivity succeeded; Supabase Auth settings returned HTTP 200.
- Migration `001_live` applied to the dedicated `atlas` schema. Existing application schemas were not changed.
- Actual cloud RLS check verified owner-only reads and writes in a rolled-back diagnostic transaction.
- 95 Vitest tests passed: domain logic, SQLite demo, isolated PostgreSQL/RLS workflows, scraper selectors/structured data, quotas/recovery, source revocation and email tokens.
- Final production build, TypeScript and repository formatting checks passed. The local production server and worker are running the final implementation.
- 10 live API smoke checks passed, including demo-session rejection, protected imports, private admin access, URL rejection and cross-origin writes.
- Amazon Sony listing and Flipkart Pixel listing were parsed and imported with real source IDs, images, timestamps and price components. No cross-store equivalence was claimed between these different products.
- A real scheduled run dispatched two jobs through Redis/BullMQ. Both completed and wrote two new PostgreSQL observations (`pipeline-check-1791129565036`).
- Resend accepted a sandbox message to its reserved `delivered@resend.dev` simulation address. This proves provider acceptance, not delivery to a user's inbox. Qualifying alert delivery and duplicate suppression were tested against an injected provider in the isolated database.
- Browser checks verified real product display, retailer purchase destinations, unknown shipping states, fee totals and the live sign-in/target controls. Full cross-browser Playwright and WCAG audits have not been executed for this update.
- The implementation was committed as `ded251f` and pushed to GitHub `main`. Vercel's `/api/v1/health` endpoint still returned demo mode after the push; hosted live activation is not verified. The Vercel dashboard redirects this browser session to sign-in, so its environment settings could not be changed.
- The live catalog was checked at the normal browser size and at 390px width, with no horizontal page overflow. A preview is saved in `docs/previews/live-catalog.png`.

External release checks remain: real sign-in callback/provider configuration, eligible source permissions, real recipient delivery with a verified sender domain, signed webhook setup, permanent worker hosting, Redis eviction settings, production deployment and load/restore rehearsals. These are not represented as passed.
