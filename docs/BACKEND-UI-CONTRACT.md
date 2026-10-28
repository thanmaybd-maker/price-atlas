# Backend contract for the UI work

UI components and styles are owned by the concurrent UI work. Backend additions preserve existing response fields.

`GET /api/v1/catalog/status` returns public counts, canonical category IDs/labels and expansion progress. `products` counts saved SKU records. `expansion.verifiedBaseProducts` counts unique Nykaa parent product IDs that passed product-page verification; multiple shade/size discovery links under one parent count once. The target is 2,500 such base products, separately from the existing catalog. Pending discovery links are not saved products and do not count as verified.

Category labels live in `packages/domain/categories.ts`. The main categories include `beauty`, `personal-care`, `home-kitchen`, `appliances`, `accessories`, `fashion`, `books`, `stationery` and `services`, alongside the original device categories. Classify by the main product, not compatibility or bundled accessory wording. The Motorola Pad with a keyboard is a tablet; the iPhone mentioning AirPods is a phone.

`POST /api/v1/discovery` accepts `{query, store?: 'all' | Store, searchMore?: boolean}`. Recorded catalog matches return first without external fetching. `searchMore: true` explicitly asks for additional free retailer discovery, while reusing a concurrent in-progress lookup. Ordinary name searches are free only. A supported direct product URL explicitly permits bounded paid verification. `GET /api/v1/discovery?q=...&store=...` polls the same scope. Results include `products`, `offers`, `candidates`, `sources`, `state` and `cached`. Candidate prices are never observations. Verified size/shade/model/ISBN attributes participate in matching; unrelated URLs and delivery text do not.

Cached and saved-catalog lookups use the general 60-per-minute API allowance. Work that actually needs retailer fetching has a separate five-per-minute per-user/IP allowance, plus the shared retailer and daily budgets. A local catalog lookup does not consume that fetching allowance. Recorded observation timestamps remain unchanged.

Product attributes may include `Retailer`, `Product URL`, `Base product ID`, `Source category`, `Shade`, `Size`, `Delivery note`, `Price note`, `Checked at`, `Source price` and `Source currency`. Preserve shade/size identity. Native foreign-currency prices remain metadata, with no invented INR conversion. Unknown shipping is not free shipping. Timestamps describe the actual observation; cache reuse does not refresh them.

Bulk imports retain a weekly catalog check interval to fit the shared request allowance. Enabled target rules still receive hourly scheduling. Offer display freshness remains 24 hours and alert eligibility one hour. Weekly checks do not extend a stored offer's freshness. The 2,500-product import progresses in bounded batches and can pause at the shared daily request limit.

Never display or request provider API keys in a client component. Provider account failover is entirely server-side.
