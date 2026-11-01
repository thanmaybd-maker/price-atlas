# Private Antigravity product research

Price Atlas uses the official signed-in Antigravity CLI for optional background product discovery. Website visitors submit product queries to a bounded private database queue. A signed-in worker researches supported retailer links; the existing verifier reads their pages and saves only source prices. Ordinary search starts immediately and works independently of this worker.

Verified locally on 1 November 2026: Sony WH-1000XM5 research returned Amazon and Flipkart links in about 47 seconds. Publishing an RTX 5060 report produced Amazon and Flipkart results, including a new ZOTAC listing. Retailer blocking still occurs; no provider guarantees a price for every product.

## Automatic website discovery

Set `AGENT_RESEARCH_ENABLED=true` on the web deployment. On the signed-in machine, keep this command running from the repository root:

```powershell
npx -y pnpm@11.19.0 research:worker
```

The worker checks CLI sign-in before announcing readiness, sends a short heartbeat and processes one shared job at a time. The website polls in the background and refreshes product results when leads are ready. If the machine is off, the queue is busy, a source fails or the daily allowance is reached, the page explains that state and keeps ordinary results available. With this feature enabled, these requests use Antigravity rather than the Gemini API.

Defaults: 20 attempts per UTC day, at most 8 queued jobs, 3 web searches per research run, and a 24-hour shared lead cache. Failures count as attempts and have a 15-minute retry cooldown. `AGENT_RESEARCH_DAILY_LIMIT` can set a limit from 1 to 100. Google account limits still apply independently.

## Run on your PC

Sign into the official `agy` CLI with your intended research Google account. Telegram/Discord account configuration is separate and this command does not change it. The CLI's existing signed-in account is used; the script does not select an account by email.

```powershell
agy
npx -y pnpm@11.19.0 research:products "RTX 5060 graphics card"
```

The first command opens the official CLI. Check its signed-in account there before researching. The second command writes a report under `data/agent-research/`. It does not write to the database. Reports include supported retailer URLs, title-derived variant signatures, matching leads and separately held conflicts. Links remain unverified; an agent may still return a stale or incorrect listing.

To publish the leads to the shared cache and immediately run ordinary free product-page verification:

```powershell
npx -y pnpm@11.19.0 research:products "RTX 5060 graphics card" --publish
```

Publishing requires the project's private `DATABASE_URL`. Only the normal verifier can save product prices or stock observations. Failed or blocked pages remain unverified. No prices from the model are retained. Variants are not automatically merged into a single comparison. Cached research lasts 24 hours and is revalidated on read. Name lookups retain the existing zero-paid-credit rule, though free requests still count against daily request limits. Antigravity uses its own account quota.

To publish an already reviewed report without another model call:

```powershell
npx -y pnpm@11.19.0 research:publish data/agent-research/<report>.json
```

Reports must be less than 24 hours old and contain a name query, not a direct URL. URLs and variants are revalidated before publication. Empty reports do not overwrite a useful cache entry.

## Local and cloud hosts

The same command runs on a cloud machine with Node, pnpm, the official `agy` CLI and its own supported signed-in session. Vercel does not run the CLI in this implementation. Render/Vercel read published leads from the existing database and verify them through the existing pipeline; they do not need the Google login to consume those leads.

No Google credentials are copied to Render or Vercel. The deployed website and existing price worker consume the shared cache and verified product records; the Google session remains on the signed-in machine. Running the research worker itself in the cloud requires a host with its own supported CLI installation, persistent authentication and the private database configuration. That cloud Google sign-in has not been configured. For judging, keep the signed-in local worker running; imported product records remain on the cloud database after it stops.

## Boundaries

- Public APIs enqueue validated product-name data. They cannot supply commands, executable paths, agent definitions, environment variables or model settings.
- A temporary shopping-only profile excludes default coding components and exposes `search_web`. The CLI is requested to use sandbox mode and must report request-review permissions. Application database, scraper and messaging secrets are excluded from its child environment. Google credentials are managed by the official CLI.
- Actual tool events are checked and unexpected tools abort the session. CLI 1.3.6 reports the full global registry in `init.tools` even with a custom profile, so the connector checks the selected profile, permission mode and actual calls rather than treating that inventory as an execution log.
- Queries are passed as process arguments, not composed into shell commands.
- Research has a 120-second CLI limit and a 130-second process deadline. The complete operator job has a 250-second limit and a five-minute exclusive lease. Parsing accepts at most 24 leads; redirect resolution handles at most eight.
- Google grounding links are resolved with manual redirects. Only Google's exact public redirect endpoint is contacted; its destination must be a supported HTTPS product URL. Arbitrary redirect targets are never followed.
- The final complete JSON frame is used when the CLI concatenates formatting retries. A timeout, denied action or malformed response never counts as success. `--debug` saves the private model result under the ignored `data/agent-research/` directory for diagnosis.
- Unsupported URLs, duplicates and unrequested accessories are discarded. Wrong models, packs, storage, bindings or sizes do not enter the matching lead set.
- Removing `--publish` provides a dry run. Publishing produces ordinary first-party page observations only when verification succeeds; it never backdates history.

See [the source review](HARNESS-SEARCH-ASSESSMENT.md) for upstream architecture and documentation.
