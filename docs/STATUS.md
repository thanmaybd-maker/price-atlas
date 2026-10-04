# Implementation status

Reviewed 4 October 2026. This is a truthful inventory, not a claim of full blueprint acceptance.

## Working locally

- Responsive home, search, five category views, exact product details, up-to-four comparison, watchlist collections, alerts, settings, help/about, and source-status screens.
- Eight synthetic exact variants, sixteen source contexts, thirty days of synthetic initial checks, continuously generated demo observations from a separate worker.
- Server rendering of public catalog data, URL query/filter/sort state, browser persistence of comparison selections, session-owned database persistence of watches/rules/preferences/notifications.
- Integer-paise known delivered totals, freshness/stock/condition/currency/accepted-match gating, unknown-shipping exclusion, explicit equal-price winners, useful one-source/no-source results.
- Typed source capability contracts and normalized observation validation. Future-dated, negative, zero, fractional, conflicting-source, and unsupported-currency observations are rejected.
- Deterministic hard-attribute matching with reject/review/accept outcomes; missing decisive fields cannot be accepted.
- Exact target equality, episode deduplication, two-distinct-observation/cooldown re-arm policy, stale-gap preservation, delivery-time revalidation, preference suppression, material-edit versioning, and pause/resume preservation.
- Atomic local collection runs, unique logical observations, monotonic current projections, persistent pending in-app deliveries and retry-safe collection ledger.
- Local opaque sessions, owner-scoped repository/API access, same-origin mutation checks, bounded request validation, local rate limiting, guarded operator endpoints, account export/deletion, issue reports with reference IDs.
- Pure URL validation with no remote fetching. Arbitrary/private hosts are rejected. Supported live links return a clear source-not-connected response.
- Chart ranges, target overlays, source legends, observed-point tooltips, gaps between validity intervals, and accessible history tables.
- Local backup creation and read-only integrity checking, CI definition, reproducible lockfile, container packaging for a local demo.

## Engineering still required for the blueprint's production release

These are not completed simply by adding secrets:

- PostgreSQL/Drizzle migrations and repositories, Supabase RLS and direct-table ownership tests; removal of demo sessions in favor of real verified identities.
- Supabase email/Google login, account recovery/linking, admin identity/MFA, private production operator routes.
- Actual source adapters selected against verified provider contracts, search/discovery/import resolution, approved destination/affiliate links, image/title retention and expiry.
- A durable PostgreSQL outbox/scheduled-work dispatcher, BullMQ/Redis workers with leases, per-source quotas/circuit breakers, delayed retries, graceful distributed recovery.
- A full listing/match-assignment model, category registry, source evidence, operator match review/correction, anomaly quarantine, and a representative held-out matching evaluation. The current catalog uses exact fixture assignments.
- Real email adapter, verified destinations, idempotency reconciliation, signed provider webhooks, bounce/complaint suppression, unsubscribe links, channel preferences/quiet hours.
- Source-specific retention jobs, revocation purges, deletion tombstones and restore reconciliation, administrative data-correction tools.
- Production observability, tracing, actionable operational notifications, per-provider cost budgeting, measured performance/SLOs.
- Full production deployment, DNS/TLS and domain configuration, backup plan, restored-environment rehearsal, 15-minute target load run, cross-browser and complete WCAG audit.
- Deeper catalogs with alternative exact variants, cursor-based UI pagination, recently viewed products, real observed-drop discovery, and production-quality product photography from permitted sources.

## External inputs needed

1. An authorized data source for each retailer, working credentials, quotas, and terms covering this product's comparison/history/alerts/matching/display uses.
2. Production database/authentication and worker/Redis accounts with chosen regions and budget.
3. Email sending domain and provider, support address, Google OAuth project.
4. Repository destination, deployment accounts, brand/domain choice, approved operating budget.

No external account was created, no source agreement was assumed, no messages were sent, and no live deployment was performed.

## Current limitations to keep visible

The local operator screen is a read-only status view; token-authenticated API mutations cover collection and pause/resume, not the blueprint's full administrative review workflow. Demo profiles are tied to a browser cookie and cannot be recovered via email. Comparison illustrations are custom SVGs, not product photography. Displayed specifications are demonstration fixtures, not independently verified product claims. There are no retailer checkout links in demo mode.
