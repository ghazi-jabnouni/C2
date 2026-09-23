import crypto from 'node:crypto';
import db from '../config/db.js';

const DEFAULT_TYPES = [
  { key: 'postgresql', name: 'PostgreSQL', icon: '🐘', color: '#3b82f6', description: 'PostgreSQL operations, replication, WAL, and vacuum tasks.' },
  { key: 'mssql', name: 'Microsoft SQL Server', icon: '🪟', color: '#0284c7', description: 'AlwaysOn, transaction logs, and index maintenance tasks.' },
  { key: 'oracle', name: 'Oracle Database', icon: '🔴', color: '#dc2626', description: 'RAC, Data Guard, RMAN, and Oracle maintenance tasks.' },
  { key: 'mysql', name: 'MySQL / MariaDB', icon: '🐬', color: '#f59e0b', description: 'Replication, Galera, XtraBackup, and schema tasks.' },
  { key: 'redis', name: 'Redis Cache', icon: '⚡', color: '#ef4444', description: 'Snapshot, Sentinel, cluster, and memory tasks.' },
  { key: 'mongodb', name: 'MongoDB', icon: '🍃', color: '#10b981', description: 'ReplicaSet, oplog, sharding, and index tasks.' },
  { key: 'infrastructure', name: 'All Engines', icon: '🗄️', color: '#475569', description: 'Cross-engine and infrastructure automation tasks.' }
];

function ensureSeeded() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM database_types').get().count;
  if (count > 0) return;
  const insert = db.prepare(`
    INSERT INTO database_types (id, key, name, icon, color, description, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  for (const type of DEFAULT_TYPES) {
    insert.run(`dbt-${crypto.randomBytes(6).toString('hex')}`, type.key, type.name, type.icon, type.color, type.description, now, now);
  }
}

export const DatabaseTypeModel = {
  findAll() {
    ensureSeeded();
    return db.prepare('SELECT * FROM database_types ORDER BY rowid').all();
  },

  findById(id) {
    ensureSeeded();
    return db.prepare('SELECT * FROM database_types WHERE id = ? OR key = ?').get(id, id) || null;
  },

  create(data) {
    const id = `dbt-${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO database_types (id, key, name, icon, color, description, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.key, data.name, data.icon || '🗄️', data.color || '#475569', data.description || '', now, now);
    return this.findById(id);
  },

  update(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;
    const updated = {
      key: data.key ?? existing.key,
      name: data.name ?? existing.name,
      icon: data.icon ?? existing.icon,
      color: data.color ?? existing.color,
      description: data.description ?? existing.description
    };
    db.prepare(`
      UPDATE database_types SET key = ?, name = ?, icon = ?, color = ?, description = ?, updatedAt = ?
      WHERE id = ?
    `).run(updated.key, updated.name, updated.icon, updated.color, updated.description, new Date().toISOString(), existing.id);
    return this.findById(existing.id);
  },

  delete(id) {
    const result = db.prepare('DELETE FROM database_types WHERE id = ?').run(id);
    return result.changes > 0;
  }
};

export default DatabaseTypeModel;
