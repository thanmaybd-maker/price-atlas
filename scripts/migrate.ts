import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { postgres } from '../packages/database/postgres';
try {
  const sql = await readFile(
    new URL('../packages/database/migrations/001_live.sql', import.meta.url),
    'utf8',
  );
  await postgres().query(sql);
  console.log('Applied atlas migration 001_live. Existing application schemas were not modified.');
} catch (error) {
  console.error('Migration failed: ' + ((error as { code?: string }).code || 'database_error'));
  process.exitCode = 1;
} finally {
  await postgres().end();
}
