# Current status

Public Supabase accounts, retailer URL imports, PostgreSQL history, exact variant matching, target rules, email and Telegram outboxes, operator MFA and isolated test alerts are implemented. Retailer tracking enables history and alerts by default. Demo products remain separate and synthetic.

Public product-name and retailer-URL lookup now discovers products outside the saved catalog without requiring sign-in. Verified details support arbitrary product types under a conservative generic category; cross-store matching still requires decisive attributes. Searches use direct retailer fetching, a free web-search fallback and the configured paid provider, with shared query caching and transactional credit budgets. No synthetic live prices or history are created.

124 tests, strict type checking and the production build pass locally. Real name searches have returned verified mouse, electric-kettle, book, calculator and iron details outside the initial catalog. Daily display and hourly alert freshness are separate. Direct fetching remains available when the paid-credit allowance is exhausted.

Google authorization redirects to the configured Google consent endpoint. Production Telegram environment synchronization is configured; run `pnpm telegram:setup` after deploying the release. Actual sign-in and a user's Telegram Start/alert receipt still need human interaction. Resend has no verified sender domain, so public email alert delivery remains limited to its sandbox. The hourly GitHub workflow resumes the Render worker without copying credentials into GitHub; its independent collector remains opt-in. Free hosting and delayed schedules do not guarantee uninterrupted hourly collection.
