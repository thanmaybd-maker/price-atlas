import 'dotenv/config';
import { postgres, maintenance, collect } from '../packages/database/postgres';
import { runCollectionJob, deliverNotifications } from '../packages/jobs/index';
import { deliverTelegram } from '../packages/notifications/telegram';
import { deliverTestAlerts } from '../packages/notifications/test-alerts';
try {
  if (process.env.APP_MODE !== 'live') throw new Error('Scheduled worker requires live mode.');
  await maintenance();
  const run = await collect();
  const jobs = (
    await postgres().query(
      "SELECT j.id FROM atlas.jobs j WHERE j.state='pending' AND j.available_at<=$1 ORDER BY EXISTS(SELECT 1 FROM atlas.listings l JOIN atlas.rules r ON r.product_id=l.product_id WHERE l.id=j.payload->>'listingId' AND (r.data->>'enabled')::boolean) DESC,j.created_at,j.id LIMIT 4",
      [Date.now()],
    )
  ).rows;
  for (const job of jobs) await runCollectionJob(job.id);
  const finalRun = (
    await postgres().query('SELECT status,observations FROM atlas.runs WHERE id=$1', [run.id])
  ).rows[0];
  const deliveries = await Promise.allSettled([
    deliverNotifications(),
    deliverTelegram(),
    deliverTestAlerts(),
  ]);
  console.log(
    JSON.stringify({
      event: 'worker_once',
      ...run,
      ...finalRun,
      processed: jobs.length,
      notificationDispatch: deliveries.map((r) => r.status),
    }),
  );
  if (deliveries.some((r) => r.status === 'rejected')) process.exitCode = 1;
} finally {
  await postgres().end();
}
