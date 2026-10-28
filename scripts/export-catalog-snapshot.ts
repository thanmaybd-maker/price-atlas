import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { catalog, offers, postgres } from '../packages/database/postgres';
import { livePolicy } from '../packages/providers/live';
try {
  if (process.env.APP_MODE !== 'live') throw new Error('Snapshot requires live mode');
  const now = Date.now();
  const products = (await catalog()).filter(
    (p) => !p.name.startsWith('Saved product · source data expired'),
  );
  const observations = (await offers()).filter((o) => {
    const policy = livePolicy(o.store);
    return (
      policy.history &&
      o.historyAllowed &&
      o.observedAt + policy.historyRetentionDays * 86400000 > now
    );
  });
  const destination = path.resolve(
    'data/snapshots',
    `recorded-catalog-${new Date(now).toISOString().replace(/[:.]/g, '-')}.json`,
  );
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(
    destination,
    JSON.stringify(
      {
        kind: 'recorded_catalog_backup',
        generatedAt: new Date(now).toISOString(),
        notice:
          'Recorded source observations; prices are not live. Preserve original timestamps and expiry fields.',
        products,
        observations,
      },
      null,
      2,
    ),
    { flag: 'wx' },
  );
  console.log(
    JSON.stringify({ destination, products: products.length, observations: observations.length }),
  );
} finally {
  await postgres().end();
}
