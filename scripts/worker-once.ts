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
      "SELECT id FROM atlas.jobs WHERE state='pending' AND available_at<=$1 ORDER BY created_at LIMIT 4",
      [Date.now()],
    )
  ).rows;
  for (const job of jobs) await runCollectionJob(job.id);
  const deliveries = await Promise.allSettled([
    deliverNotifications(),
    deliverTelegram(),
    deliverTestAlerts(),
  ]);
  console.log(
    JSON.stringify({
      event: 'worker_once',
      ...run,
      processed: jobs.length,
      notificationDispatch: deliveries.map((r) => r.status),
    }),
  );
  if (deliveries.some((r) => r.status === 'rejected')) process.exitCode = 1;
} finally {
  await postgres().end();
}
