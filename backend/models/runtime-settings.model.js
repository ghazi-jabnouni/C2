import db from '../config/db.js';

const DEFAULTS = { maxConcurrentTasks: 5, logRetentionDays: 0 };

export const RuntimeSettingsModel = {
  get() {
    const row = db.prepare('SELECT maxConcurrentTasks, logRetentionDays FROM runtime_settings WHERE id = 1').get();
    return row
      ? { maxConcurrentTasks: Number(row.maxConcurrentTasks), logRetentionDays: Number(row.logRetentionDays) }
      : { ...DEFAULTS };
  },

  save({ maxConcurrentTasks, logRetentionDays }) {
    const updatedAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO runtime_settings (id, maxConcurrentTasks, logRetentionDays, updatedAt)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET maxConcurrentTasks = excluded.maxConcurrentTasks,
        logRetentionDays = excluded.logRetentionDays, updatedAt = excluded.updatedAt
    `).run(maxConcurrentTasks, logRetentionDays, updatedAt);
    return this.get();
  }
};

export default RuntimeSettingsModel;