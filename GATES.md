# Gates: usable targets, themes, history and responsive flows

OWNS: apps/web/**, packages/domain/**, packages/database/**, tests/**, docs/**, GATES.md

Scope: repair the reported Price Atlas flows while preserving the paper/sticky-note design and real observation provenance.

- [x] G1: Home Pin it saves directly for signed-in users, shows a confirmed sticky note, and never opens the legacy target dialog.
      EVIDENCE: Isolated signed-in browser fixture verified a confirmed note after POST acknowledgement; ₹199.50 posts 19950 paise. Guest flow no longer opens Name your price. Real persistence and account isolation are covered by PostgreSQL integration tests.
- [x] G2: Guest target drafts survive sign-in, and product/compare target entry uses the same paper language with visible pending, error and success states.
      EVIDENCE: Browser sign-in-return fixture consumes one explicit draft and creates one confirmed note. Product and comparison actions route to the shared paper composer. This is not a claim of completed human Google consent.
- [x] G3: Light and Dark apply consistently to home, categories, search, product, account and target controls, including reload and storage denial.
      EVIDENCE: Appearance before sign-in and cross-route persistence pass. Mobile sweep at 360px covers eight pages in both themes with zero serious/critical Axe findings; the signed-in target board is also audited. Existing storage-denial regression remains in the release suite.
- [x] G4: Seven/thirty-day views show retained real observations, item/delivered basis, actual coverage, loading/error/retry and no fabricated gaps.
      EVIDENCE: Real history overview returns Sony's seven retained checks across October 6, 28 and 29, plus other products checked October 28/29. History-failure/retry browser test recovers actual recorded rows. Coverage unit tests preserve gaps and exclude unknown delivered totals.
- [x] G5: Target confirmation and history reads avoid avoidable sequential work; request failure cannot silently look like empty history.
      EVIDENCE: One bounded history request replaces four product-history reads. Public reads bypass account synchronization and share a 30-second bounded cache without changing observation timestamps. The save response follows persistence; evaluation/dispatch runs after the response. No session refresh blocks the confirmed note.
- [x] G6: Free historical-data options are checked against primary documentation; any external data retains product, source, currency and time provenance.
      EVIDENCE: docs/HISTORY-SOURCES.md links primary documentation for public free trackers, Keepa, ShopSavvy and Open Prices. External tracker homepages plus copyable canonical links are provided. No competitor dataset was scraped or republished, and no unrelated grocery data fills electronics/beauty charts.
- [x] G7: Domain regressions, account isolation, type checking and production build pass; desktop/mobile browser flows are verified against that production build.
      CHECK: pnpm test
      EXPECT: passed
      EVIDENCE: Final local 167 unit/integration tests, type checking and production build pass. All 12 release/usability browser scenarios pass against that build, including eight pages in both themes at 360px. The real history API smoke passes for four products and invalid input rejection. CI and hosted production checks follow publication; human Google consent and authorized Telegram receipt are separate acceptance tasks.
