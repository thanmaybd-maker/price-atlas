import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { postgres } from '../packages/database/postgres';
try {
  const directory = new URL('../packages/database/migrations/', import.meta.url);
  for (const file of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
    await postgres().query(await readFile(new URL(file, directory), 'utf8'));
    console.log(`Applied atlas migration ${file}.`);
  }
} catch (error) {
  console.error('Migration failed: ' + ((error as { code?: string }).code || 'database_error'));
  process.exitCode = 1;
} finally {
  await postgres().end();
}
