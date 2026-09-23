import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspacesDir = path.resolve(__dirname, '../workspaces');

export const TaskModel = {
  findAll: (templateId) => {
    let rows;
    if (templateId) {
      rows = db.prepare('SELECT * FROM tasks WHERE templateId = ? ORDER BY rowid DESC').all(templateId);
    } else {
      rows = db.prepare('SELECT * FROM tasks ORDER BY rowid DESC').all();
    }
    return rows.map(TaskModel._parse);
  },

  findById: (id) => {
    const r = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!r) return null;
    return TaskModel._parse(r);
  },

  create: (data) => {
    const id = `task-${Date.now()}`;
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO tasks (id, templateId, templateName, status, startedAt, finishedAt, duration, triggeredBy, inventoryName, playbook, extraVars, "limit", hostsStats, logs)
      VALUES (?, ?, ?, 'running', ?, NULL, 'running...', ?, ?, ?, ?, ?, ?, '[]')
    `);
    stmt.run(
      id,
      data.templateId,
      data.templateName || '',
      now,
      data.triggeredBy || 'Operator',
      data.inventoryName || '',
      data.playbook || '',
      data.extraVars || '{}',
      data.limit || 'all',
      JSON.stringify({ ok: 0, changed: 0, unreachable: 0, failed: 0, skipped: 0 })
    );
    return TaskModel.findById(id);
  },

  updateStatus: (id, status, duration, hostsStats) => {
    const now = new Date().toISOString();
    db.prepare(`UPDATE tasks SET status = ?, finishedAt = ?, duration = ?, hostsStats = ? WHERE id = ?`)
      .run(status, now, duration || '0s', JSON.stringify(hostsStats || {}), id);
    return TaskModel.findById(id);
  },

  appendLog: (id, logLines) => {
    const task = db.prepare('SELECT logs FROM tasks WHERE id = ?').get(id);
    if (!task) return;
    const existing = JSON.parse(task.logs || '[]');
    const merged = existing.concat(logLines);
    db.prepare('UPDATE tasks SET logs = ? WHERE id = ?').run(JSON.stringify(merged), id);
  },

  cancel: (id) => {
    const now = new Date().toISOString();
    db.prepare(`UPDATE tasks SET status = 'cancelled', finishedAt = ?, duration = 'cancelled' WHERE id = ? AND status = 'running'`).run(now, id);
    return TaskModel.findById(id);
  },

  delete: (id) => {
    try {
      if (id) {
        const workspacePath = path.join(workspacesDir, id);
        if (fs.existsSync(workspacePath)) {
          fs.rmSync(workspacePath, { recursive: true, force: true });
        }
      }
    } catch (err) {
      console.error(`[TaskModel] Error deleting workspace folder for task ${id}:`, err);
    }
    const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return result.changes > 0;
  },

  clearHistory: (templateId) => {
    try {
      const tasks = templateId
        ? db.prepare('SELECT id FROM tasks WHERE templateId = ?').all(templateId)
        : db.prepare('SELECT id FROM tasks').all();
      
      tasks.forEach((t) => {
        try {
          const workspacePath = path.join(workspacesDir, t.id);
          if (fs.existsSync(workspacePath)) {
            fs.rmSync(workspacePath, { recursive: true, force: true });
          }
        } catch (_) {}
      });

      if (templateId) {
        db.prepare('DELETE FROM tasks WHERE templateId = ?').run(templateId);
      } else {
        db.prepare('DELETE FROM tasks').run();
      }
      return true;
    } catch (err) {
      console.error('[TaskModel] Error clearing task history:', err);
      return false;
    }
  },

  _parse: (r) => {
    let hostsStats, logs;
    try { hostsStats = JSON.parse(r.hostsStats || '{}'); } catch { hostsStats = {}; }
    try { logs = JSON.parse(r.logs || '[]'); } catch { logs = []; }
    return { ...r, hostsStats, logs };
  }
};
