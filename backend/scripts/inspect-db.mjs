import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'database', 'sqlite.db');

console.log('Inspecting DB:', dbPath);

let db;
try {
  db = new DatabaseSync(dbPath);
} catch (err) {
  console.error('Failed to open DB:', err.message);
  process.exit(1);
}

try {
  // Normalize: mark repos missing a lastSync as not-synced
  try {
    db.exec("UPDATE repositories SET status = 'not-synced' WHERE lastSync IS NULL;");
    console.log('Normalized repository statuses (lastSync IS NULL => not-synced)');
  } catch (e) {
    // ignore
  }

  const rows = db.prepare('SELECT id, name, gitUrl, branch, status, lastSync FROM repositories ORDER BY rowid DESC').all();
  console.log('Repositories count:', rows.length);
  console.log(JSON.stringify(rows, null, 2));
} catch (err) {
  console.error('Query error:', err.message);
  process.exit(1);
}

// Also list users
try {
  const users = db.prepare('SELECT id, name, email, role, status, lastLogin FROM users ORDER BY rowid DESC').all();
  console.log('\nUsers count:', users.length);
  console.log(JSON.stringify(users, null, 2));
} catch (err) {
  console.error('Users query error:', err.message);
}
