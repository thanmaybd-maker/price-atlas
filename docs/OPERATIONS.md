# Local operations

## Database and processes

Use one persistent SQLite file shared by web and worker. `ATLAS_DB_PATH` overrides the path discovered from `pnpm-workspace.yaml`. WAL mode, foreign keys, a five-second busy timeout, and `BEGIN IMMEDIATE` transactions are enabled. This single-node local design is not a distributed production architecture.

The worker collects sixteen observations per minute unless a demo source is paused. Run keys are minute buckets, so two workers/retries in one minute cannot duplicate the logical batch. A transaction inserts observations, advances only newer current projections, evaluates rules, and dispatches in-app entries. A crash rolls back an incomplete transaction. There is no external email side effect.

Stop a foreground process with Ctrl+C. Restarting either process does not erase the database. Stop development before running `pnpm build`/`pnpm start` so `.next` is not being written by two build processes.

## Operator API

Set a long random `ADMIN_TOKEN` in the web process environment. Never commit it. Send it only to the local application's `X-Admin-Token` header. Do not put it in a URL or NEXT_PUBLIC variable.

- `POST /api/v1/admin/collect` runs the current minute's demo batch idempotently.
- `POST /api/v1/admin/provider` with `{store:"Amazon",paused:true,reason:"Testing source outage"}` pauses synthetic collection and writes an audit entry.
- Resume with `paused:false`. Existing prices expire naturally; pausing does not falsify their timestamps.
- `GET /api/v1/admin` reports aggregate demo counts, provider pause state, and the latest twenty collection runs. It contains no account identities or secrets.

## Backup and recovery

```sh
pnpm backup data/backups/before-change.sqlite
pnpm backup:check data/backups/before-change.sqlite
```

Backup uses SQLite `VACUUM INTO` for a consistent snapshot even while WAL is active. The destination must not already exist. A backup includes private demo sessions and user data; keep it local and out of source control.

To inspect an older state safely, stop both application processes, preserve the current database and any WAL/SHM companions in a separate directory, copy the backup to a **new** path, set `ATLAS_DB_PATH` to that path, and start the web process without the worker. Inspect account state and pending notifications before deciding whether to restart collection. Do not restore over an active database. Restore verification in this delivery checked snapshot integrity, not a production RPO/RTO exercise.

Production restore requires tombstones, source-retention reconciliation and external delivery reconciliation that are not implemented in this demo. Never use this local backup procedure as a claim of production disaster recovery readiness.

## Troubleshooting

- **No fresh offers:** start `pnpm worker`. Do not extend validity timestamps by hand.
- **Cannot save:** inspect session state and browser origin. Requests from another origin are intentionally rejected. Use the same `127.0.0.1` hostname throughout, or configure `APP_ORIGIN` for a proxy.
- **Port occupied:** keep the existing process if it belongs to this app, or choose another port and matching origin. Do not terminate unrelated processes.
- **Profile disappeared:** signing out or deleting cookies loses access to that demo identity. Production identity recovery is not implemented.
- **Worker and web disagree:** ensure both use the same absolute `ATLAS_DB_PATH`.
- **Live mode error:** deliberate fail-closed behavior. Implement and validate actual production repositories/providers before enabling live mode.

## Source-capability inventory

| Source         | Current implementation      | History        | Alerts            | Live resolution | Purchases      |
| -------------- | --------------------------- | -------------- | ----------------- | --------------- | -------------- |
| Amazon label   | Synthetic fixture generator | Synthetic only | Local in-app only | Unconfigured    | No destination |
| Flipkart label | Synthetic fixture generator | Synthetic only | Local in-app only | Unconfigured    | No destination |

The store names identify simulated source contexts. They do not imply retailer approval or a connection.
