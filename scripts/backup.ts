import { db } from '../packages/database/index';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
const destination = path.resolve(
  process.argv[2] || `data/backups/atlas-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`,
);
if (existsSync(destination))
  throw new Error('Backup destination already exists. Choose a new filename.');
mkdirSync(path.dirname(destination), { recursive: true });
db().prepare('VACUUM INTO ?').run(destination);
console.log(`Consistent SQLite backup created: ${destination}`);
