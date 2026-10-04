import 'dotenv/config';
import { postgres } from '../packages/database/postgres';
import { randomUUID } from 'node:crypto';
const c = await postgres().connect();
try {
  await c.query('BEGIN');
  const alice = randomUUID(),
    bob = randomUUID();
  await c.query(
    'INSERT INTO atlas.users(id,name,email,verified,created_at) VALUES($1,$2,$3,true,$4),($5,$6,$7,true,$4)',
    [
      alice,
      'Isolation diagnostic A',
      'diagnostic-a@example.invalid',
      Date.now(),
      bob,
      'Isolation diagnostic B',
      'diagnostic-b@example.invalid',
    ],
  );
  await c.query('SET LOCAL ROLE atlas_request');
  await c.query("SELECT set_config('atlas.user_id',$1,true)", [alice]);
  const visible = await c.query('SELECT id FROM atlas.users');
  if (visible.rows.length !== 1 || visible.rows[0].id !== alice)
    throw new Error('RLS isolation check failed.');
  const protectedUpdate = await c.query('UPDATE atlas.users SET notifications=0 WHERE id=$1', [
    bob,
  ]);
  if (protectedUpdate.rowCount !== 0) throw new Error('RLS write isolation check failed.');
  console.log(
    'Cloud PostgreSQL RLS: owner-only reads and writes verified. Diagnostic transaction rolled back.',
  );
} catch (error) {
  console.error(
    'Cloud isolation check failed: ' + ((error as { code?: string }).code || 'isolation_failure'),
  );
  process.exitCode = 1;
} finally {
  await c.query('ROLLBACK');
  c.release();
  await postgres().end();
}
