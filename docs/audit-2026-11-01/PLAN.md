# Price Atlas audit plan

Goal: reproduce and fix important user-flow defects, audit real infrastructure and collection evidence, and identify useful additions without redesigning the product.

Architecture: retain the Next.js UI/API, PostgreSQL evidence and outboxes, Render collection worker and existing source adapters. Fix the narrowest demonstrated boundary; retain deterministic matching, honest history and shared budgets. Findings use measured experiments with keep/reject evidence, not the unrelated CUDA training harness.

Tech stack: Next.js, React, TypeScript, PostgreSQL/Supabase, Upstash, Render, Vercel, Playwright and Vitest.

Spec: ../CLAUDE-CODEX-EXECUTION-BRIEF.md when present. Completion ledger: GATES.md in this directory. Earlier GATES.md remains unchanged.

Constraints: no secrets in reports; no mass messages; exactly one authorized user-owned Telegram test after confirming the recipient. No account creation, billing upgrades, arbitrary new provider accounts, destructive database operations or weakened source access controls. Keep existing UI identity and unrelated changes. Real human consent/receipt and seven actual reliability days cannot be replaced by fixture tests.

Execution: inspect current source and all existing automated suites; audit cloud services and source counters; reproduce notification/UI defects with regression tests; repair and verify affected paths; research source additions and alternatives; record pending human or time-dependent acceptance explicitly. Work solo initially; do not dispatch other chats.

Status log:

- 2026-11-01: Audit started on codex/project-audit-20261101. User authorized one test to their own connected Telegram account only.
