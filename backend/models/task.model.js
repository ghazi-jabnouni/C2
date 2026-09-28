import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../config/db.js';
import { WorkflowModel } from './workflow.model.js';
import { WorkflowRunModel } from './workflow-run.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspacesDir = path.resolve(__dirname, '../workspaces');

function getTaskWorkspacePath(taskId) {
  if (typeof taskId !== 'string' || !/^task-[A-Za-z0-9_-]+$/.test(taskId)) {
    const error = new Error('Invalid task ID.');
    error.statusCode = 400;
    throw error;
  }
  const workspacePath = path.resolve(workspacesDir, taskId);
  const relativePath = path.relative(workspacesDir, workspacePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    const error = new Error('Task workspace path is outside the workspace directory.');
    error.statusCode = 400;
    throw error;
  }
  return workspacePath;
}

export const TaskModel = {
  countRunning: () => db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE status = 'running'").get().count,

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
      INSERT INTO tasks (id, templateId, templateName, type, provider, terraformAction, winrmPort, winrmUseSsl, status, startedAt, finishedAt, duration, triggeredBy, inventoryName, playbook, extraVars, environmentId, environmentName, environmentVariables, "limit", hostsStats, logs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, NULL, 'running...', ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')
    `);
    stmt.run(
      id,
      data.templateId,
      data.templateName || '',
      data.type || 'ansible',
      data.provider || 'aws',
      data.terraformAction || 'apply',
      data.winrmPort ? String(data.winrmPort) : '5985',
      data.winrmUseSsl ? (data.winrmUseSsl === true || data.winrmUseSsl === '1' ? '1' : '0') : '0',
      now,
      data.triggeredBy || 'Operator',
      data.inventoryName || '',
      data.playbook || '',
      data.extraVars || '{}',
      data.environmentId || null,
      data.environmentName || '',
      JSON.stringify(data.environmentVariables || {}),
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
    if (!id) return false;
    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get(id);
    if (!task) return false;
    if (task.status === 'running') {
      const error = new Error('Cannot delete a running task. Cancel it or wait for it to finish first.');
      error.statusCode = 409;
      throw error;
    }

    fs.rmSync(getTaskWorkspacePath(id), { recursive: true, force: true });
    WorkflowModel.removeTaskExecution(id);
    WorkflowRunModel.removeTaskLogs(id);
    const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return result.changes > 0;
  },

  deleteFinishedBefore: (cutoff) => {
    const expiredTasks = db.prepare("SELECT id FROM tasks WHERE startedAt < ? AND status != 'running'").all(cutoff);
    expiredTasks.forEach((task) => TaskModel.delete(task.id));
    return expiredTasks.length;
  },

  clearHistory: (templateId) => {
    const tasks = templateId
      ? db.prepare("SELECT id FROM tasks WHERE templateId = ? AND status != 'running'").all(templateId)
      : db.prepare("SELECT id FROM tasks WHERE status != 'running'").all();
    let deleted = 0;
    tasks.forEach(({ id }) => {
      if (TaskModel.delete(id)) deleted += 1;
    });
    return deleted;
  },

  _parse: (r) => {
    let hostsStats, logs, environmentVariables;
    try { hostsStats = JSON.parse(r.hostsStats || '{}'); } catch { hostsStats = {}; }
    try { logs = JSON.parse(r.logs || '[]'); } catch { logs = []; }
    try { environmentVariables = JSON.parse(r.environmentVariables || '{}'); } catch { environmentVariables = {}; }
    return { ...r, hostsStats, logs, environmentVariables };
  }
};
