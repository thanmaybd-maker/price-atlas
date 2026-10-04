import 'dotenv/config';
import { Pool } from 'pg';
import Redis from 'ioredis';
const configured = (name: string) => Boolean(process.env[name]?.trim());
console.log(
  JSON.stringify({
    event: 'configuration',
    mode: process.env.APP_MODE || 'demo',
    database: configured('DATABASE_URL'),
    auth: configured('SUPABASE_URL') && configured('SUPABASE_ANON_KEY'),
    redis: configured('REDIS_URL'),
    email: configured('RESEND_API_KEY'),
    scrapingBee: configured('SCRAPINGBEE_API_KEY'),
    brightData: configured('BRIGHTDATA_API_KEY'),
    emailFrom: configured('EMAIL_FROM'),
  }),
);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  max: 1,
});
try {
  await pool.query('SELECT 1');
  console.log('PostgreSQL: reachable');
} catch (e) {
  console.log('PostgreSQL: ' + ((e as { code?: string }).code || 'connection_failed'));
} finally {
  await pool.end();
}
if (configured('REDIS_URL')) {
  const redis = new Redis(process.env.REDIS_URL!, {
    lazyConnect: true,
    connectTimeout: 10000,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  try {
    await redis.connect();
    console.log('Redis: ' + (await redis.ping()));
  } catch {
    console.log('Redis: connection_failed');
  } finally {
    redis.disconnect();
  }
}
if (configured('SUPABASE_URL')) {
  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY || '' },
      signal: AbortSignal.timeout(10000),
    });
    console.log('Supabase Auth: HTTP ' + response.status);
  } catch {
    console.log('Supabase Auth: connection_failed');
  }
}
