# Price Atlas verification checklist

Use the live site, with browser developer tools open. Recorded prices retain their real timestamps. A retailer can block requests or return no match; a clean unverified state with usable store links is the correct result in that situation.

| Test                  | Input / action                                                  | Expected behavior                                                                                                                        | Paid credits      |
| --------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Academic book         | `Introduction to Algorithms Cormen 4th Edition`                 | Retains supplied ISBN/edition/binding. Paperback and hardcover do not merge. Missing identity requires review.                           | 0                 |
| Scientific calculator | `Casio fx-991CW`                                                | Does not merge with fx-991ES Plus. Checks relevant stores; blocked sources retain discovery/store links.                                 | 0                 |
| Appliance             | `Philips HD9252/90 Air Fryer`                                   | Matches model; Croma/Reliance delivery badges require pincode verification at checkout.                                                  | 0                 |
| Meesho utility        | `Silicone Cable Organizer Clips`                                | Pack of 1/3/5 stay separate. Search results are discovery evidence until a product page verifies them.                                   | 0                 |
| Cosmetics             | `Minimalist Niacinamide 10% 30ml`                               | Does not substitute 60ml. Preserves source shade/size, price, stock uncertainty and timestamp.                                           | 0                 |
| Cross-border          | `NOW Foods Omega-3 200 Softgels` or `Sony MDR-7506`             | iHerb/B&H stay outside domestic ranking even when the source quotes INR. USD retains original currency. No guessed duty or landed price. | 0                 |
| Cache                 | Repeat the calculator query                                     | Shared cached results retain original observation time and avoid new scrapes.                                                            | 0                 |
| Fresh discovery       | Click **Search more stores for free**                           | Queries additional relevant stores using direct/free discovery only; may return unverified links.                                        | 0                 |
| Direct URL            | Paste a supported product URL or click **Deep Verify this URL** | Free request first; paid fallback only within per-request and shared budgets. A title-only page is partial, with no fabricated price.    | Up to 10          |
| Invalid URL           | `https://example-unknown-shop.xyz/item/123`                     | Clear validation banner lists supported stores; no retailer or paid requests.                                                            | 0                 |
| WAF                   | Blocked Myntra/AJIO product                                     | Explicit unverified/partial state; never an invented current price or in-stock claim.                                                    | 0 for name search |
| Share/history         | Copy link; reopen; search/view >8 products                      | Query/store filters restore; latest eight searches/views retained locally. Clear history removes them.                                   | 0                 |
| Daily ledger          | View a product with retained observations                       | India day boundaries; real daily min/max; missing previous day means no comparison, not a guessed change.                                | 0                 |
| Account               | Sign in with Google                                             | Complete Google consent as the human account owner; return to Price Atlas. Save/watch survives reload.                                   | 0                 |
| Alert                 | Set an item-price target if delivery is unknown                 | Rule persists; only fresh accepted matching domestic observations can qualify.                                                           | 0                 |
| Telegram              | Settings → Connect → open bot → Start                           | Link binds to the signed-in account. Actual test delivery requires the recipient's explicit authorization.                               | 0                 |
| Export/delete         | Settings export and account deletion                            | Account-scoped actions require sign-in and same-origin requests. Confirm deletion only on a disposable evaluator account.                | 0                 |

## Limits and presentation readiness

- Hard ceilings: 1,000 source requests/day, 100 paid credits/day, 300/month, 10 per explicit verification. Environment settings may lower these ceilings.
- Name search, additional discovery and scheduled collection use no paid credits. Paid balance exhaustion leaves recorded results and free discovery usable.
- `GET /api/v1/catalog/status` reports actual saved products, verified expansion parents and the next retry time. The 2,500-product target is not a completed count. Retailer blocks, request budgets and hosting availability affect completion.
- Email delivery requires a verified sender domain; the existing sandbox does not deliver to arbitrary evaluators. Google consent and Telegram Start require a real human action.
- Run `pnpm test`, `pnpm typecheck`, `pnpm build`, and `TEST_URL=<live URL> pnpm test:live-api` before presenting. `pnpm catalog:snapshot` creates a private recorded-data backup with original timestamps; it is not a live-price feed.
