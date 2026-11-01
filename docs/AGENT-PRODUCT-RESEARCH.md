# Private Antigravity product research

This optional operator tool uses the supported Antigravity CLI to research product pages across multiple retailers. It does not expose an agent or command runner to website visitors.

**Experimental:** structured query rewriting succeeded locally, but live multi-retailer research timed out during this review. Validation and database-verification tests pass with fixtures; this is not proof of a working live discovery provider. This draft is not enabled in production. Do not depend on it for a demo until a real research report and subsequent retailer verification succeed.

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

## Local and cloud hosts

The same command runs on a cloud machine with Node, pnpm, the official `agy` CLI and its own supported signed-in session. Vercel does not run the CLI in this implementation. Render/Vercel read published leads from the existing database and verify them through the existing pipeline; they do not need the Google login to consume those leads.

No Google credentials have been copied to Render or Vercel. A fully autonomous cloud agent is **not enabled**. That requires a chosen host with persistent supported authentication and a reviewed worker setup. A phone login does not authenticate another host. For judging, a local research run can seed the shared cache while the public app continues operating independently of the PC.

## Boundaries

- Agent execution is private and explicitly started by an operator, never by a public API.
- It runs in a temporary workspace with sandbox mode and without the skip-permissions flag. Application database, scraper and messaging secrets are excluded from its child environment. Existing CLI account settings still govern its tools; run only trusted operator queries.
- Queries are passed as process arguments, not composed into shell commands.
- Research is bounded to 90 seconds, at most 24 parsed leads, and supported product URLs.
- Unsupported URLs, duplicates and unrequested accessories are discarded. Wrong models, packs, storage, bindings or sizes do not enter the matching lead set.
- Removing `--publish` provides a dry run. Publishing produces ordinary first-party page observations only when verification succeeds; it never backdates history.

See [the source review](HARNESS-SEARCH-ASSESSMENT.md) for upstream architecture and documentation.
