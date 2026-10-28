# Verified catalog expansion

The expansion discovers official Nykaa lipstick, makeup and skincare category pages, then fetches each unique parent product page using direct HTTP only. Search/listing prices are ignored. Only a successfully parsed primary product page creates a saved product and any price observation. The selected shade/size is preserved; other shades under that parent do not inflate the target.

PostgreSQL stores category pagination, the deduplicated frontier, leases, attempts, the target and progress. A restart resumes the same frontier. Concurrent local and hosted workers share a lease and transactional request budgets. Failed/blocked pages remain unavailable and never create invented products or prices.

```sh
pnpm catalog:expand --target 2500
pnpm catalog:expand --target 2500 --steps 10
pnpm catalog:snapshot
```

The existing hosted worker performs up to two expansion steps per tick after normal collection and notification work. The standalone command paces work independently and pauses at the shared daily request limit. The hosted worker can resume after the next UTC day starts. Source availability, hosting sleep and quotas affect completion time; the target is not a claim that 2,500 products are already verified.

Every category and product request counts toward `SCRAPER_REQUESTS_PER_DAY=1000` and the retailer's per-minute allowance. The importer never calls ScrapingBee or consumes paid fallback credits. Three category pages contain discovery information only; their candidate links are not counted as verified products.

Bulk listings retain a weekly catalog cadence; watched listings retain hourly checks. Prices still expire for fresh display after 24 hours and for alerts after one hour. A 2,500-product catalog cannot honestly promise every product a daily refresh within a 1,000-total-request daily ceiling.

`GET /api/v1/catalog/status` exposes progress without credentials. `pnpm check:readiness` separately reports saved products and fresh eligible offers.

The snapshot command writes a private, ignored JSON backup containing only catalog facts and permitted retained observations. It preserves original observation/expiry times and explicitly labels the file as recorded data, not current live pricing. No user accounts, notification recipients, sessions or provider credentials are exported. A presentation UI may use such a file only with an explicit recorded-snapshot label; this export does not add or modify UI components.
