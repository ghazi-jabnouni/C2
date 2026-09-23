import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'database', 'sqlite.db');

const db = new DatabaseSync(dbPath);
const tokens = db.prepare('SELECT id, name, tokenPrefix, tokenFull, scopes, createdAt, lastUsedAt FROM tokens ORDER BY rowid DESC').all();
console.log('Tokens count:', tokens.length);
console.log(JSON.stringify(tokens, null, 2));
process.exit(0);
