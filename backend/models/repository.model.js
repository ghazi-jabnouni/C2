import db from '../config/db.js';

export const RepositoryModel = {
  findAll: () => {
    const rows = db.prepare('SELECT * FROM repositories ORDER BY rowid DESC').all();
    return rows.map((r) => ({ ...r, playbooks: r.playbooks ? JSON.parse(r.playbooks) : [] }));
  },

  findById: (id) => {
    const r = db.prepare('SELECT * FROM repositories WHERE id = ?').get(id);
    if (!r) return null;
    return { ...r, playbooks: r.playbooks ? JSON.parse(r.playbooks) : [] };
  },

  create: (data) => {
    const id = `repo-${Date.now()}`;
    const name = data.name;
    const gitUrl = data.gitUrl;
    const branch = data.branch || 'main';
    const credentialId = data.credentialId || null;
    const lastSync = data.lastSync || null;
    const status = data.status || 'not-synced';
    const playbooks = Array.isArray(data.playbooks) ? JSON.stringify(data.playbooks) : JSON.stringify([]);
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO repositories (id, name, gitUrl, branch, credentialId, lastSync, status, playbooks, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, name, gitUrl, branch, credentialId, lastSync, status, playbooks, now, now);

    console.log('[repo:model] Inserted repository id=', id);
    const inserted = RepositoryModel.findById(id);
    console.log('[repo:model] Retrieved after insert:', inserted ? inserted.id : null);
    return inserted;
  },

  update: (id, data) => {
    const fields = [];
    const values = [];

    if (data.name) { fields.push('name = ?'); values.push(data.name); }
    if (data.gitUrl) { fields.push('gitUrl = ?'); values.push(data.gitUrl); }
    if (data.branch) { fields.push('branch = ?'); values.push(data.branch); }
    if (data.credentialId !== undefined) { fields.push('credentialId = ?'); values.push(data.credentialId); }
    if (data.lastSync) { fields.push('lastSync = ?'); values.push(data.lastSync); }
    if (data.status) { fields.push('status = ?'); values.push(data.status); }
    if (data.playbooks) { fields.push('playbooks = ?'); values.push(JSON.stringify(data.playbooks)); }

    if (fields.length === 0) {
      return RepositoryModel.findById(id);
    }

    fields.push('updatedAt = ?');
    values.push(new Date().toISOString());

    values.push(id);
    const stmt = db.prepare(`UPDATE repositories SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return RepositoryModel.findById(id);
  },

  delete: (id) => {
    const info = db.prepare('DELETE FROM repositories WHERE id = ?').run(id);
    return info.changes > 0;
  }
};
