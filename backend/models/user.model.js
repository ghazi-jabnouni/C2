import db from '../config/db.js';
import crypto from 'node:crypto';

// --- Password helpers ---
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const attempt = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'));
}

export const UserModel = {
  findAll: () => {
    // Never return password in list queries
    return db.prepare('SELECT id, name, email, role, status, lastLogin FROM users ORDER BY rowid DESC').all();
  },

  findById: (id) => {
    return db.prepare('SELECT id, name, email, role, status, lastLogin FROM users WHERE id = ?').get(id);
  },

  findByEmail: (email) => {
    // Returns full row including password — for auth only
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  },

  create: (data) => {
    const id = `usr-${Date.now()}`;
    const role = data.role || 'Operator';
    const status = data.status || 'active';
    const lastLogin = new Date().toISOString();
    const password = hashPassword(data.password || 'changeme');

    const stmt = db.prepare(`
      INSERT INTO users (id, name, email, password, role, status, lastLogin)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, data.name, data.email, password, role, status, lastLogin);
    return db.prepare('SELECT id, name, email, role, status, lastLogin FROM users WHERE id = ?').get(id);
  },

  update: (id, data) => {
    const fields = [];
    const values = [];

    if (data.name) { fields.push('name = ?'); values.push(data.name); }
    if (data.email) { fields.push('email = ?'); values.push(data.email); }
    if (data.role) { fields.push('role = ?'); values.push(data.role); }
    if (data.status) { fields.push('status = ?'); values.push(data.status); }
    if (data.avatar) { /* ignore avatar updates - column removed */ }
    if (data.password) { fields.push('password = ?'); values.push(hashPassword(data.password)); }

    if (fields.length === 0) {
      return db.prepare('SELECT id, name, email, role, status, lastLogin FROM users WHERE id = ?').get(id);
    }

    values.push(id);
    const stmt = db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return db.prepare('SELECT id, name, email, role, status, lastLogin FROM users WHERE id = ?').get(id);
  },

  updateLastLogin: (id) => {
    db.prepare('UPDATE users SET lastLogin = ? WHERE id = ?').run(new Date().toISOString(), id);
  },

  delete: (id) => {
    const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return info.changes > 0;
  },

  verifyPassword
};
