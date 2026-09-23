import crypto from 'node:crypto';
import db from '../config/db.js';

function genId() {
  return `env-${crypto.randomBytes(6).toString('hex')}`;
}

export const EnvironmentModel = {
  findAll() {
    const rows = db.prepare('SELECT * FROM environments ORDER BY name').all();
    return rows.map(r => ({
      ...r,
      variables: r.variables ? JSON.parse(r.variables) : {},
      secrets: r.secrets ? JSON.parse(r.secrets) : {}
    }));
  },

  findById(id) {
    const r = db.prepare('SELECT * FROM environments WHERE id = ?').get(id);
    if (!r) return null;
    return {
      ...r,
      variables: r.variables ? JSON.parse(r.variables) : {},
      secrets: r.secrets ? JSON.parse(r.secrets) : {}
    };
  },

  create({ name, variables, secrets }) {
    const id = genId();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO environments (id, name, variables, secrets, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, name, JSON.stringify(variables || {}), JSON.stringify(secrets || {}), now, now);
    return this.findById(id);
  },

  update(id, { name, variables, secrets }) {
    const now = new Date().toISOString();
    const existing = this.findById(id);
    if (!existing) return null;
    const newName = name ?? existing.name;
    const newVars = variables ?? existing.variables;
    const newSecs = secrets ?? existing.secrets;
    db.prepare('UPDATE environments SET name = ?, variables = ?, secrets = ?, updatedAt = ? WHERE id = ?')
      .run(newName, JSON.stringify(newVars || {}), JSON.stringify(newSecs || {}), now, id);
    return this.findById(id);
  },

  delete(id) {
    db.prepare('DELETE FROM environments WHERE id = ?').run(id);
    return { success: true };
  }
};

export default EnvironmentModel;
