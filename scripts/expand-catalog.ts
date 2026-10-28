import 'dotenv/config';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  startCatalogExpansion,
  runCatalogExpansionStep,
  catalogExpansionStatus,
} from '../packages/jobs/catalog-expansion';
import { postgres } from '../packages/database/postgres';
try {
  if (process.env.APP_MODE !== 'live') throw new Error('Expansion requires live mode');
  const index = process.argv.indexOf('--target');
  const target = index < 0 ? 2500 : Number(process.argv[index + 1]);
  await startCatalogExpansion(target);
  const stepsIndex = process.argv.indexOf('--steps');
  const steps = stepsIndex < 0 ? Infinity : Number(process.argv[stepsIndex + 1]);
  for (let i = 0; i < steps; i++) {
    const result = await runCatalogExpansionStep();
    console.log(JSON.stringify(result));
    if (
      result.event === 'catalog_target_reached' ||
      (result.event === 'catalog_budget_pause' && result.code !== 'rate_limited')
    )
      break;
    await sleep(5500);
  }
  console.log(JSON.stringify(await catalogExpansionStatus()));
} finally {
  await postgres().end();
}
