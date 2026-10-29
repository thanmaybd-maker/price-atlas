# Price history from Internet Archive captures

`pnpm backfill:wayback` looks for archived copies of supported retailer product pages on
web.archive.org and turns only proven, exact-variant captures into **history-only**
observations.

## What counts

| Report field           | Meaning                                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| `indexedCaptures`      | CDX index rows returned. These are not prices.                            |
| `candidateDays`        | India dates with a capture that passed time, status and identity checks.  |
| `fetchedSnapshots`     | Raw captures fetched from the archive with proven capture time.           |
| `parseableSnapshots`   | Captures the shared retailer parser read with price, stock and condition. |
| `acceptedObservations` | Exact-variant matches. At most one per listing per India date.            |

`--index-only` reports only the first two. The default dry run is validated.

## Rules

- A capture must have a valid 14-digit UTC timestamp, not be in the future, sit inside both the
  requested range and the retailer's history retention, be HTTP 200 HTML, and identify the exact
  store and listing ID. HTTP originals are normalised to the HTTPS identity locally.
- Replays use `id_` raw captures with manual redirects. A redirect is followed only to another
  raw capture of the same listing on web.archive.org (max three hops) and is relabelled with that
  capture's time. The `Memento-Datetime` header must equal the labelled second. Live retailer hosts
  are never fetched.
- Requests are paced (1.5 s), time out after 20 s, are capped at 6 MB and by content type, retry at
  most twice on 429/5xx/timeouts honouring `Retry-After`, and share a run-wide request budget.
- Captcha, empty, partial, no-price, unknown-stock, out-of-stock, non-new and identity-mismatch
  pages are separate skip reasons. Unknown shipping stays `null`.
- Variants are matched with the catalog's `compareAttributes` against the listing's stored
  evidence. A listing with none of its category's decisive attributes, or an archive page missing
  one the listing has, stays unverified and is skipped.
- Observations: id `wayback:<listing>:<timestamp>`, `historyAllowed=true`,
  `alertsAllowed=false`, `displayAllowed=false`, `validUntil=observedAt`, `source='wayback'`,
  evidence with original retailer URL, archive URL, extraction `archived retailer HTML`, parser
  version and `verifiedLiveByPriceAtlas: false`.

## Apply

`--apply` writes only `data/wayback/validated.json` from a validated dry run made in the last
48 hours. It makes no archive requests. Each listing is written in one transaction that re-checks
the listing is still accepted, domestic and on the same product, skips days that already have our
own observation, and inserts with explicit columns and `ON CONFLICT DO NOTHING`. It never touches
`current_offers`, schedules, rules, evaluations or notifications.

## Launchers

- `run-history-backfill.bat`: frozen install, validated dry run, then the typed `yes` prompt.
- `check-history-archive.bat`: dry run only, output in `data\wayback\`.
