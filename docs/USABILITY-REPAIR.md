# Theme, targets, latency and history repair

29 October 2026. The reported failures were reproduced before editing: Pin it opened the old target dialog, guest Settings had no appearance control, and Home had neither a price-basis selector nor a visible history-loading/error state.

## Changes

- One paper target composer now serves Home, product and comparison entry points. Any domestic saved product can be selected by name; entry is no longer limited to three abbreviated suggestions. Decimal rupees preserve paise. Signed-in saves show a note after the API confirms persistence, with no second form or blocking session refresh. Explicit guest drafts survive the sign-in return. Cancelling sign-in clears the pending action.
- Light and Dark are available before sign-in, persist through navigation/reload, and theme the root pages, home worlds, category board, forms and ring canvas together. Product offer ticket entrances retain readable text while moving, rather than fading low-contrast text into view.
- A bounded public history batch replaces four individual product requests. Home defaults to item-price history, lets the user choose a weekly product, and provides delivered-basis selection, recorded coverage, a daily table and refresh/error states. Without saved products, it chooses products with more real recorded days rather than the newest one-day imports.
- Each recorded day has a visible chart marker, including isolated checks separated by missing days. Lines never bridge an unobserved gap.
- Public catalog reads coalesce within a 30-second in-process cache; no account or notification data is cached. Public reads skip account synchronization. Product detail reads refresh the current product's offers independently of the catalog cache. Original observation times and eligibility windows are unchanged.
- The target response follows persistence and scheduling. Rule evaluation and in-app dispatch run after the response, so their processing cannot turn an already-saved target into a failed save response. The durable worker remains the recovery path.

## Data limits and free references

The retained database has observations on October 6, 28 and 29. Most products were added October 28/29; earlier days are missing, not zero-price days. The featured Sony history contains seven actual checks across these dates. A thirty-day window is not a claim that thirty days were observed.

See [history source research](./HISTORY-SOURCES.md). Public free trackers may have older data, but their visible charts are not an unrestricted free API. Product links can be copied into an independent tracker; those external observations do not affect Price Atlas rankings, history or alerts. No paid history provider, new account or scraping-credit spend was added.

## Verification

The PostgreSQL integration suite exercises retained batch history and account isolation. Coverage and bounded-cache tests verify source timestamps, sparse dates, unknown shipping, failed reads and cache coalescing. Browser scenarios verify direct pinning, a simulated sign-in return, decimal amounts, history failure/retry, theme persistence and 360px layouts across eight pages in both themes. Private browser flows use isolated session/POST fixtures and do not send real messages or prove actual Google consent. The real public history endpoint is tested separately against retained data.

The acceptance ledger is [GATES.md](../GATES.md). Real Google sign-in and authorized Telegram receipt remain human acceptance tasks; unrelated untracked user files are preserved.
