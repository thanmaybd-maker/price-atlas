# Current status

Public Supabase accounts, retailer URL imports, PostgreSQL history, exact variant matching, target rules, email and Telegram outboxes, operator MFA and isolated test alerts are implemented. Retailer tracking enables history and alerts by default. Demo products remain separate and synthetic.

111 tests and the production build pass. The real catalog import has run; unavailable listings remain unavailable, and collection failures do not create invented prices. Public imports share a transactional daily request budget with scheduled collection. Unwatched products refresh daily and enabled targets hourly, subject to budget and retailer availability.

Remaining hosted verification: Telegram secret synchronization, webhook registration, a user's Start/connection and actual alert receipt; a Resend domain for public email recipients; public Google OAuth availability. Free Render web services can sleep. The optional GitHub scheduled collector is implemented but disabled until repository secrets and its enable variable are configured.
