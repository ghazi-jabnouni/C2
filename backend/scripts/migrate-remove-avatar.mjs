import db from '../config/db.js';

console.log('Running migration: remove avatar column from users table if present');
try {
  const cols = db.prepare("PRAGMA table_info('users')").all();
  const hasAvatar = cols.some(c => c.name === 'avatar');
  if (!hasAvatar) {
    console.log('No avatar column present. Nothing to do.');
    process.exit(0);
  }

  db.exec('BEGIN TRANSACTION;');

  // Create new table without avatar
  db.exec(`CREATE TABLE IF NOT EXISTS users_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Operator',
    status TEXT NOT NULL DEFAULT 'active',
    lastLogin TEXT
  );`);

  // Copy data (excluding avatar)
  db.exec(`INSERT INTO users_new (id, name, email, password, role, status, lastLogin)
    SELECT id, name, email, password, role, status, lastLogin FROM users;`);

  // Drop old table and rename
  db.exec('DROP TABLE users;');
  db.exec('ALTER TABLE users_new RENAME TO users;');

  db.exec('COMMIT;');

  console.log('Migration completed: avatar column removed');
} catch (err) {
  console.error('Migration failed:', err.message);
  try { db.exec('ROLLBACK;'); } catch (e) {}
  process.exit(1);
}
process.exit(0);
