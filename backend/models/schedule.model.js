import db from '../config/db.js';

export const ScheduleModel = {
  findAll: () => {
    const rows = db.prepare('SELECT * FROM schedules ORDER BY rowid DESC').all();
    return rows.map((r) => ({ ...r, enabled: r.enabled === 1 || r.enabled === '1' }));
  },

  findById: (id) => {
    const r = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
    if (!r) return null;
    return { ...r, enabled: r.enabled === 1 || r.enabled === '1' };
  },

  create: (data) => {
    const id = `sched-${Date.now()}`;
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO schedules (id, templateId, templateName, cron, cronHuman, enabled, lastRun, nextRun, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    `);
    stmt.run(
      id,
      data.templateId,
      data.templateName || '',
      data.cron,
      data.cronHuman || '',
      data.enabled !== false ? 1 : 0,
      data.nextRun || null,
      now,
      now
    );
    return ScheduleModel.findById(id);
  },

  update: (id, data) => {
    const fields = [];
    const values = [];

    if (data.templateId !== undefined) { fields.push('templateId = ?'); values.push(data.templateId); }
    if (data.templateName !== undefined) { fields.push('templateName = ?'); values.push(data.templateName); }
    if (data.cron !== undefined) { fields.push('cron = ?'); values.push(data.cron); }
    if (data.cronHuman !== undefined) { fields.push('cronHuman = ?'); values.push(data.cronHuman); }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled ? 1 : 0); }
    if (data.lastRun !== undefined) { fields.push('lastRun = ?'); values.push(data.lastRun); }
    if (data.nextRun !== undefined) { fields.push('nextRun = ?'); values.push(data.nextRun); }

    if (fields.length === 0) return ScheduleModel.findById(id);

    fields.push('updatedAt = ?');
    values.push(new Date().toISOString());
    values.push(id);

    db.prepare(`UPDATE schedules SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return ScheduleModel.findById(id);
  },

  delete: (id) => {
    const info = db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
    return info.changes > 0;
  }
};
