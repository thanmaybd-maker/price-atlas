# Local JSON API

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

There is no asynchronous live import operation endpoint, email webhook, or production OAuth callback in the current demo. Do not integrate a client against a fabricated endpoint.
