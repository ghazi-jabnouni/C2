import db from '../config/db.js';

const DEFAULTS = { maxConcurrentTasks: 5, logRetentionDays: 0, serviceNames: [] };

export const RuntimeSettingsModel = {
  get() {
    const row = db.prepare('SELECT maxConcurrentTasks, logRetentionDays, serviceNames FROM runtime_settings WHERE id = 1').get();
    if (!row) return { ...DEFAULTS };
    let serviceNames = [];
    try { serviceNames = JSON.parse(row.serviceNames || '[]'); } catch {}
    return {
      maxConcurrentTasks: Number(row.maxConcurrentTasks),
      logRetentionDays: Number(row.logRetentionDays),
      serviceNames: Array.isArray(serviceNames) ? serviceNames : []
    };
  },

  save({ maxConcurrentTasks, logRetentionDays, serviceNames = [] }) {
    const updatedAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO runtime_settings (id, maxConcurrentTasks, logRetentionDays, serviceNames, updatedAt)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET maxConcurrentTasks = excluded.maxConcurrentTasks,
        logRetentionDays = excluded.logRetentionDays, serviceNames = excluded.serviceNames, updatedAt = excluded.updatedAt
    `).run(maxConcurrentTasks, logRetentionDays, JSON.stringify(serviceNames), updatedAt);
    return this.get();
  }
};

export default RuntimeSettingsModel;