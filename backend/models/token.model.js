import db from '../config/db.js';
import crypto from 'node:crypto';

function genPrefix() {
  return `sem_${crypto.randomBytes(3).toString('hex')}`;
}

function genFull(prefix) {
  const hex = crypto.randomBytes(20).toString('hex');
  return `${prefix}_${hex}`;
}

export const TokenModel = {
  findAll: () => db.prepare('SELECT id, name, tokenPrefix, tokenFull, scopes, createdAt, lastUsedAt, expiresAt FROM tokens ORDER BY rowid DESC').all(),

  findByFull: (full) => db.prepare('SELECT * FROM tokens WHERE tokenFull = ?').get(full),

  findByPrefix: (prefix) => db.prepare('SELECT * FROM tokens WHERE tokenPrefix = ?').get(prefix),

  create: ({ name, scopes, expiresAt } = {}) => {
    const id = `tok-${Date.now()}`;
    const prefix = genPrefix();
    const full = genFull(prefix);
    const createdAt = new Date().toISOString();
    const scopesJson = JSON.stringify(scopes || []);
    db.prepare('INSERT INTO tokens (id, name, tokenPrefix, tokenFull, scopes, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, name || 'Unnamed Token', prefix, full, scopesJson, createdAt, expiresAt || null);
    return db.prepare('SELECT id, name, tokenPrefix, tokenFull, scopes, createdAt, lastUsedAt, expiresAt FROM tokens WHERE id = ?').get(id);
  },

  delete: (id) => {
    const info = db.prepare('DELETE FROM tokens WHERE id = ?').run(id);
    return info.changes > 0;
  }
};
