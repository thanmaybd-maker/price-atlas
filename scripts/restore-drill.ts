import 'dotenv/config';
import { PGlite } from '@electric-sql/pglite';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import path from 'node:path';
import assert from 'node:assert/strict';
import { postgres } from '../packages/database/postgres';

const quoted = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const digest = (rows: string[]) =>
  createHash('sha256')
    .update([...rows].sort().join('\n'))
    .digest('hex');
type Table = { name: string; rows: string[]; digest: string };
const connection = await postgres().connect();
let released = false;
let scratch: PGlite | undefined;
try {
  await connection.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await connection.query("SET LOCAL TIME ZONE 'UTC'");
  const names = (
    await connection.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='atlas' ORDER BY tablename",
    )
  ).rows.map((row) => row.tablename as string);
  const edges = (
    await connection.query(
      "SELECT child.relname AS child,parent.relname AS parent FROM pg_constraint fk JOIN pg_class child ON child.oid=fk.conrelid JOIN pg_class parent ON parent.oid=fk.confrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace WHERE fk.contype='f' AND ns.nspname='atlas'",
    )
  ).rows;
  const tables: Table[] = [];
  for (const name of names) {
    const rows = (
      await connection.query(`SELECT to_jsonb(t)::text AS row FROM atlas.${quoted(name)} t`)
    ).rows.map((row) => row.row as string);
    tables.push({ name, rows, digest: digest(rows) });
  }
  await connection.query('COMMIT');
  connection.release();
  released = true;

  const directory = path.resolve('data/backups');
  await mkdir(directory, { recursive: true });
  const filename = path.join(
    directory,
    `live-logical-${new Date().toISOString().replace(/[:.]/g, '-')}.enc`,
  );
  const key = randomBytes(32),
    iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(gzipSync(JSON.stringify({ version: 1, createdAt: Date.now(), tables }))),
    cipher.final(),
  ]);
  await writeFile(filename, Buffer.concat([iv, cipher.getAuthTag(), encrypted]), {
    flag: 'wx',
    mode: 0o600,
  });
  await writeFile(filename + '.key', key, { flag: 'wx', mode: 0o600 });
  // Restore the persisted encrypted backup, not the in-memory original.
  const persisted = await readFile(filename);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    await readFile(filename + '.key'),
    persisted.subarray(0, 12),
  );
  decipher.setAuthTag(persisted.subarray(12, 28));
  const restored = JSON.parse(
    gunzipSync(
      Buffer.concat([decipher.update(persisted.subarray(28)), decipher.final()]),
    ).toString(),
  ) as { tables: Table[] };
  scratch = new PGlite();
  const migrations = new URL('../packages/database/migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort())
    await scratch.exec(await readFile(new URL(file, migrations), 'utf8'));
  await scratch.exec('BEGIN');
  await scratch.exec("SET LOCAL TIME ZONE 'UTC'");
  await scratch.exec(`TRUNCATE ${names.map((name) => 'atlas.' + quoted(name)).join(',')} CASCADE`);
  const remaining = [...restored.tables],
    done = new Set<string>();
  while (remaining.length) {
    const index = remaining.findIndex((table) =>
      edges.every(
        (edge) =>
          edge.child !== table.name ||
          edge.parent === table.name ||
          !names.includes(edge.parent) ||
          done.has(edge.parent),
      ),
    );
    if (index < 0) throw new Error('Foreign-key dependency cycle needs an explicit restore plan.');
    const table = remaining.splice(index, 1)[0];
    if (table.rows.length)
      await scratch.query(
        `INSERT INTO atlas.${quoted(table.name)} SELECT * FROM json_populate_recordset(NULL::atlas.${quoted(table.name)},$1::json)`,
        ['[' + table.rows.join(',') + ']'],
      );
    const rows = (
      await scratch.query<{ row: string }>(
        `SELECT to_jsonb(t)::text AS row FROM atlas.${quoted(table.name)} t`,
      )
    ).rows.map((row) => row.row);
    assert.equal(rows.length, table.rows.length, `Count mismatch for ${table.name}`);
    assert.equal(digest(rows), table.digest, `Content mismatch for ${table.name}`);
    done.add(table.name);
  }
  await scratch.exec('COMMIT');
  const report = {
    checkedAt: new Date().toISOString(),
    tables: done.size,
    rows: tables.reduce((sum, table) => sum + table.rows.length, 0),
    countsAndHashes: 'verified',
    productionReadOnly: true,
    notificationsReplayed: false,
    scratchEngine: 'PGlite isolated PostgreSQL-compatible engine',
    scope:
      'atlas application schema; excludes managed Supabase Auth, storage, server roles and provider configuration',
  };
  await writeFile(filename + '.report.json', JSON.stringify(report, null, 2), {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(JSON.stringify({ ...report, backup: filename, keyStoredSeparately: true }));
} catch (error) {
  if (!released)
    try {
      await connection.query('ROLLBACK');
    } catch {}
  console.error(
    JSON.stringify({
      restoreDrill: 'failed',
      code: (error as { code?: string }).code || 'verification_error',
    }),
  );
  process.exitCode = 1;
} finally {
  if (!released) connection.release();
  await scratch?.close();
  await postgres().end();
}
