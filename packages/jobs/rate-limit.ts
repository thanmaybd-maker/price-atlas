import Redis from 'ioredis';
import { createHash } from 'node:crypto';
let client: Redis;
export async function limited(subject: string, limit = 60) {
  if (!process.env.REDIS_URL)
    throw new Error('REDIS_URL is required for distributed request limits.');
  if (!client) {
    client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      retryStrategy: () => null,
    });
    client.on('error', () => {});
  }
  const key = `atlas:limit:${createHash('sha256').update(subject).digest('hex')}`;
  const count = await client.eval(
    "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],60000) end; return n",
    1,
    key,
  );
  return Number(count) > limit;
}
