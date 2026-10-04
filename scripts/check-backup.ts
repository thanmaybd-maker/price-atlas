import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
if (!process.argv[2]) throw new Error('Pass the backup file to verify.');
const backup = new DatabaseSync(path.resolve(process.argv[2]), { readOnly: true });
const result = backup.prepare('PRAGMA integrity_check').get();
if (result?.integrity_check !== 'ok') throw new Error('Backup integrity check failed.');
const products = backup.prepare('SELECT count(*) n FROM products').get();
console.log(
  JSON.stringify({
    integrity: 'ok',
    products: products?.n,
    readOnly: true,
    deliveryReplayed: false,
  }),
);
backup.close();
