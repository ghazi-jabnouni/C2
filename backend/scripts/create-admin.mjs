import db from '../config/db.js';
import crypto from 'node:crypto';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

const email = 'admin@automaton.local';
// Ensure `password` column exists (older DBs may not have it)
const cols = db.prepare("PRAGMA table_info('users')").all();
const hasPassword = cols.some((c) => c.name === 'password');
if (!hasPassword) {
  console.log('🔧 Adding missing `password` column to users table...');
  try {
    db.exec("ALTER TABLE users ADD COLUMN password TEXT;");
    console.log('✅ `password` column added');
  } catch (err) {
    console.error('❌ Failed to add password column:', err.message);
    process.exit(1);
  }
}

const exists = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

if (exists) {
  console.log(`User already exists: ${exists.email}`);
  process.exit(0);
}

const insert = db.prepare(`INSERT INTO users (id, name, email, password, role, status, lastLogin) VALUES (?, ?, ?, ?, ?, ?, ?)`);
insert.run(
  'usr-admin',
  'Admin',
  email,
  hashPassword('admin123'),
  'Admin',
  'active',
  new Date().toISOString()
);

console.log('✅ Created admin user (admin@automaton.local / admin123)');
process.exit(0);
