import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'database', 'sqlite.db');

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error('Usage: node set-admin.mjs <email> <password>');
  process.exit(1);
}

function hashPassword(pwd) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pwd, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

const db = new Database(dbPath);
try {
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const hashed = hashPassword(password);

  if (existing) {
    db.prepare('UPDATE users SET name = ?, password = ?, role = ?, status = ? WHERE email = ?')
      .run('Admin', hashed, 'Admin', 'active', email);
    console.log('Updated user:', email);
  } else {
    db.prepare(`INSERT INTO users (id, name, email, password, role, status, lastLogin)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('usr-admin', 'Admin', email, hashed, 'Admin', 'active', new Date().toISOString());
    console.log('Inserted user:', email);
  }

  const user = db.prepare('SELECT id, name, email, password, role, status FROM users WHERE email = ?').get(email);
  console.log('User row:');
  console.log(user);
} catch (err) {
  console.error('Error:', err.message || err);
  process.exit(1);
} finally {
  db.close();
}
