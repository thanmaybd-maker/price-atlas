# Telegram alerts

Users sign in to Price Atlas, open Settings → Connect Telegram, open the generated private link and press Start. The worker sends qualifying alerts to that private chat. Email opt-in is independent; disabling price notifications disables all alert channels. Discord is not implemented in this update.

## Activate the bot

1. Create a bot through the verified [BotFather](https://t.me/BotFather). Keep its token private.
2. Copy these values from the private local `.env` into **Vercel**, then redeploy:

   ```env
   TELEGRAM_BOT_TOKEN=<private BotFather token>
   TELEGRAM_BOT_USERNAME=thanmayatlasbot
   TELEGRAM_WEBHOOK_SECRET=<same random secret of at least 32 characters everywhere>
   ```

   The webhook secret has been generated locally. Copy its actual value from `.env`; do not paste it into chat or commit it. Use letters, digits, `_` and `-` only.
   Render's sending worker requires `TELEGRAM_BOT_TOKEN`; it does not need the username or webhook secret. Restart the worker with the updated token and latest code.

3. Migration `002_telegram` is applied to this project's database. For another database, run `pnpm migrate` before deployment.
4. Run `pnpm telegram:setup` locally. This verifies the bot username, hosted live health and protected route, then registers `/api/webhooks/telegram` with Telegram. It does not send a message to a personal inbox.
5. Sign in to the hosted app → Settings → Connect Telegram → open the link → press Start. Settings should show Connected within 15 seconds. Send `/stop` or use Disconnect Telegram in Settings to stop bot messages.
6. Save a target and collect a fresh eligible price. Source alert capabilities must be enabled in the source's configured policy. The default current-import development policy disables alerts; bot configuration does not change that policy. See [source configuration](./SCRAPING.md#source-capabilities).

## What is implemented

- Ten-minute, single-use connection links stored only as SHA-256 hashes. Creating a replacement invalidates older links for that account. Group chats, bot senders and mismatched private-chat identities cannot link accounts. A linked chat cannot silently move to another account.
- Authenticated, bounded webhooks and duplicate-update handling. Connection status in Settings reflects the saved database state; webhook confirmation replies do not prove delivery.
- One PostgreSQL delivery per notification episode, claimed with locks. Dispatch rechecks the connection, preferences, rule version, source capability and fresh eligible price. Pre-connection alerts are not backfilled. Account deletion cascades connection, link and delivery records.
- Rate-limit retries honor `retry_after`; blocked bots disable the connection. Timeout/uncertain sends and expired send leases enter operator review because Telegram has no send-idempotency key. The private MFA-protected dashboard supports closure or an explicit retry after checking the chat and accepting duplicate risk.
- Plain-text alerts with previews disabled and stored API message receipts. Receipts confirm acceptance, not that the recipient read the message. Email bounces do not disable Telegram alerts.

Standard Telegram bot messages are free within [API rate limits](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this). There is no 100% delivery guarantee. Alerts depend on collection cadence and worker uptime. A [Render Free web service sleeps after 15 minutes without inbound traffic](https://render.com/docs/free#spinning-down-on-idle); its HTTP health listener does not make background polling continuous.

## Verification

106 tests pass, covering linking/RLS, expiry/replay, group rejection, no backfill, duplicate suppression, uncertain sends, retry-after, blocked chats, disconnect and audited operator closure. Provider tests use injected responses. The real bot passed `getMe` and matched the configured username during setup validation. Hosted webhook registration and a real person's connection/alert remain unverified until cloud settings are present and the user presses Start.

Regenerate the token supplied in chat through BotFather, update the private environments and rerun setup afterward.
