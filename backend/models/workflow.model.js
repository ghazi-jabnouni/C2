import crypto from 'node:crypto';
import db from '../config/db.js';

function id() {
  return `wf-${crypto.randomBytes(6).toString('hex')}`;
}

function parse(row) {
  if (!row) return null;
  return {
    ...row,
    nodes: row.nodes ? JSON.parse(row.nodes) : [],
    edges: row.edges ? JSON.parse(row.edges) : [],
    executionHistory: row.executionHistory ? JSON.parse(row.executionHistory) : []
  };
}

export const WorkflowModel = {
  findAll() {
    return db.prepare('SELECT * FROM workflows ORDER BY rowid DESC').all().map(parse);
  },
  findById(workflowId) {
    return parse(db.prepare('SELECT * FROM workflows WHERE id = ?').get(workflowId));
  },
  create(data) {
    const workflowId = id();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO workflows (id, name, description, nodes, edges, executionHistory, totalRuns, lastRunStatus, lastRunAt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(workflowId, data.name, data.description || '', JSON.stringify(data.nodes || []), JSON.stringify(data.edges || []), JSON.stringify(data.executionHistory || []), 0, 'never', null, now, now);
    return this.findById(workflowId);
  },
  update(workflowId, data) {
    const existing = this.findById(workflowId);
    if (!existing) return null;
    db.prepare(`
      UPDATE workflows SET name = ?, description = ?, nodes = ?, edges = ?, executionHistory = ?, totalRuns = ?, lastRunStatus = ?, lastRunAt = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      data.name ?? existing.name,
      data.description ?? existing.description,
      JSON.stringify(data.nodes ?? existing.nodes),
      JSON.stringify(data.edges ?? existing.edges),
      JSON.stringify(data.executionHistory ?? existing.executionHistory ?? []),
      data.totalRuns ?? existing.totalRuns,
      data.lastRunStatus ?? existing.lastRunStatus,
      data.lastRunAt ?? existing.lastRunAt,
      new Date().toISOString(),
      workflowId
    );
    return this.findById(workflowId);
  },
  delete(workflowId) {
    return db.prepare('DELETE FROM workflows WHERE id = ?').run(workflowId).changes > 0;
  }
};

export default WorkflowModel;
