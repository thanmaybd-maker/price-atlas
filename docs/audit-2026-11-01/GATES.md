# Gates: Price Atlas whole-project audit and polish

Workspace: C:/Users/skc/Documents/Codex/price atlas. Preserve the existing paper design and user files. This ledger records the current audit, not earlier release claims.

- [x] G1: Current source, tests, typecheck and build audited; demonstrated regressions repaired.
      CHECK: pnpm test; pnpm typecheck; pnpm build
      EXPECT: exit 0, no failing tests or build errors.
      EVIDENCE: 265 tests across 28 files passed; typecheck and production build exit 0. Decisive outputs: data/audit-tests-20261101.txt and data/audit-build-20261101.txt. Regression failures were observed before fixes.
- [x] G2: Vercel production deployment, CI and sanitized runtime errors inspected.
      EVIDENCE: db2a637 production READY; GitHub CI run 41269582229 succeeded. Live health 200. Fifteen-minute error/fatal query returned no matches after correcting an out-of-retention request.
- [x] G3: Render worker health, collection failures and scheduling inspected in the user-confirmed workspace.
      EVIDENCE: User confirmed My Workspace. Render service price-atlas is not suspended; sampled worker_tick and catalog_waiting logs inspected. No error-level logs returned in the queried window; this does not prove continuous uptime.
- [x] G4: Supabase database/auth configuration, history coverage and account isolation inspected without exposing private records.
      EVIDENCE: ACTIVE_HEALTHY; configuration, schema, security and performance advisors inspected. 287 products with retained eligible history; zero complete 7/30-day histories. Account-isolation tests pass. Open warnings and their limits are recorded in REPORT.md.
- [x] G5: Telegram connection, invalid/expired link, loading, network failure and retry states tested and repaired.
      EVIDENCE: Existing Telegram/database suites cover invalid/expired links and isolation. New browser regressions cover network rejection and unsuccessful HTTP status; 21 release/audit browser scenarios passed after repairs. Link/test feedback remains separate from provider receipt.
- [x] G6: Exactly one authorized Telegram test sent to the user's own connected account; provider response and human receipt distinguished.
      EVIDENCE: Exact user-specified account matched one enabled connection; sendTelegramTest returned ok:true with receipt. User answered “Yes, received it”. Attempt journal prevents rerunning the script. Private receipt: data/audit-telegram-test-20261101.json; no recipient identity committed.
- [x] G7: Real Google login and save/reload acceptance distinguished from configured OAuth and fixture tests.
      EVIDENCE: Google enabled, matching Google identity exists, user reported signing in. Real browser remained signed out; real account target save/reload is still unverified. Only database isolation and browser fixtures establish automated save coverage. This gate records that distinction; it does not close the real-account acceptance requirement.
- [x] G8: Main journeys tested at desktop, phone and intermediate widths, both themes; rendered evidence and accessibility errors inspected.
      CHECK: release browser suites against the production build
      EXPECT: no failing cases; manual visual inspection also recorded.
      EVIDENCE: 21 browser scenarios passed. Existing 360px eight-page Light/Dark serious/critical Axe sweep passed; new 768/1440px four-route checks passed. Screenshots: data/audit-settings-{768,1440}-{light,dark}.png and data/review-evidence-proof.png. Legacy demo-only journeys were not claimed as live-account checks.
- [x] G9: Collection budgets, provider fallback, freshness, matching and historical provenance audited with actual counters.
      EVIDENCE: Production environment ceilings 1000 requests/day, 100 paid credits/day, 300/month confirmed without exposing credentials. Typed source outcomes, budget-query/model regression, source badges and worker replay guards tested. Explicit five-credit alternative Flipkart experiment remained blocked. History workflow run 41256585985 failed before any archive fetch because DATABASE_URL is absent.
- [x] G10: Additional retailers and blocked-source alternatives researched with named primary sources and feasibility evidence.
      EVIDENCE: Robu.in, MDComputers and Bookswagon primary pages inspected and linked in REPORT.md. These are candidate lanes, not implemented adapters or verified prices. Existing providers, permitted feeds/APIs and staged URL lists compared; source blocks remain explicit.
- [x] G11: Required versus optional additions prioritized; current limitations and full execution brief retained.
      EVIDENCE: REPORT.md retains balanced 2500-product expansion, Gmail/push, FX, serviceability, recovery and seven actual days as unfinished requirements; no current feature was silently renamed complete. No skills installed or authored without a relevant deliverable.
- [ ] G12: Changes independently verified, diff reviewed and release status reported accurately.
      EVIDENCE: pending
- [x] G13: HyperFrames demo assessed after core journeys; any video work, usage limits or deferral reported explicitly.
      EVIDENCE: No HyperFrames project/video was created in this audit. Video remains a later brief deliverable after live data/account/recovery acceptance; usage was not checked and is unknown. CUDA training is inapplicable to this repository.

Autoresearch Lean's CUDA/train.py harness does not apply to this Next.js repository. No GPU experiments or compute provisioning are authorized by naming that skill alone. Existing installed skills cover this audit; skill discovery/creation does not require installation or new skill artifacts.
