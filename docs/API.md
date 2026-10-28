# JSON API

Base path `/api/v1`. All responses are `Cache-Control: no-store` and include an `X-Request-ID`. Errors use `{error,requestId}`. Same-origin writes require matching `Origin` when present. Demo ownership comes from an opaque `atlas_session` HttpOnly cookie. Money is integer paise.

| Method     | Route                                | Behavior                                                                                             |
| ---------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| GET        | `/health`                            | Readiness of local DB, explicit demo mode                                                            |
| GET        | `/search?q=&category=&sort=&cursor=` | Canonical results, current offers, count, next offset; 24 results per page                           |
| GET        | `/suggestions?q=`                    | Same catalog query response; no model call                                                           |
| GET        | `/products/:idOrSlug?days=30`        | Exact fixture, source offers, recorded history; 1–365 days                                           |
| POST       | `/imports`                           | `{url}`; validates source/ID without fetching; returns 422 `source_not_connected` for supported URLs |
| GET        | `/session`                           | Current demo user, owned watches/rules/notifications                                                 |
| POST       | `/session`                           | `{name}`; creates a new demo user and sets an HttpOnly cookie                                        |
| DELETE     | `/session`                           | Invalidates this session                                                                             |
| POST       | `/watches`                           | `{productId,collection?}`; upsert owned saved product                                                |
| DELETE     | `/watches/:productId`                | Removes only the current user's saved item                                                           |
| POST/PATCH | `/rules`                             | `{id?,productId,target,store?,basis?,operator?,enabled?}`                                            |
| DELETE     | `/rules/:id`                         | Owner-scoped deletion and dependent notification cleanup                                             |
| PATCH      | `/preferences`                       | `{enabled}`; in-app delivery preference                                                              |
| GET        | `/export`                            | Profile and owned business data                                                                      |
| DELETE     | `/account`                           | Deletes current profile, sessions, watches, rules, notifications                                     |
| POST       | `/reports`                           | `{productId,reason}`; authenticated report with reference                                            |
| GET        | `/admin`                             | Read-only aggregate demo source/collection status                                                    |
| POST       | `/admin/collect`                     | Requires `X-Admin-Token`; idempotent current-minute collection                                       |
| POST       | `/admin/provider`                    | Requires `X-Admin-Token`; `{store,paused,reason}` with audit                                         |

Rules accept `store` = `all | Amazon | Flipkart`, `basis` = `delivered | item`, and `operator` = `lte | lt`. UI-created rules intentionally use delivered totals and `lte`. Material changes increment the rule version; pause/resume preserves it and the episode state. A target already met creates a single event. Delivery is revalidated against fresh offers and preferences.

Owner-unknown rule updates return 400 without revealing another user's rule. Deleting an unknown/non-owned saved item or rule is an idempotent no-op. Invalid numeric input returns 400. Guarded admin writes without a configured matching token return 403. Missing authenticated context returns 401.

The table above describes the separate local demo. Live mode uses verified Supabase sessions; it never creates demo users through `/session`. Live operator access requires an approved account with MFA.

## Public live product discovery

- `POST /discovery` accepts `{ "query": "Logitech M331 mouse" }` or a direct HTTPS Amazon.in/Flipkart product URL. No sign-in is required for product information. The response contains `state`, `products`, `offers`, `candidates`, `sources`, and `cached`. A concurrent duplicate lookup may return HTTP 202 with `state: "pending"`.
- `GET /discovery?q=...` reads the shared lookup result without starting collection; use this to poll a pending lookup. A missing cache entry returns `state: "missing"`.
- Product names accept 2–160 characters; direct URLs up to 2,000. Private addresses, unsupported hosts, credentials and unsafe retailer redirects are rejected. Search results supply candidate links only; prices enter the catalog only after a verified product-page parse.
- Successful queries are cached for six hours; negative/partial failures for two minutes. Anonymous writes share distributed per-client limits plus transactional source and paid-credit limits. Free direct collection continues when paid credits are exhausted, within request limits.
- `POST /imports` remains an authenticated operator/user import path. A recently verified known listing can be reused without scraping. Saving watches, rules, account exports and preferences requires a verified owner session.
- `/auth/callback`, `/auth/confirm`, `/api/webhooks/telegram` and `/api/webhooks/resend` are implemented separately from this JSON catch-all route. Webhook authentication is required.
