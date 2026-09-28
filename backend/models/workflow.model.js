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
  recordExecution(workflowId, execution) {
    const workflow = this.findById(workflowId);
    if (!workflow) return null;
    const history = workflow.executionHistory || [];
    const alreadyRecorded = history.some((run) => run.id === execution.id);
    const nextHistory = alreadyRecorded
      ? history.map((run) => run.id === execution.id ? execution : run)
      : [execution, ...history];
    db.prepare(`
      UPDATE workflows
      SET executionHistory = ?, totalRuns = ?, lastRunStatus = ?, lastRunAt = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      JSON.stringify(nextHistory),
      alreadyRecorded ? workflow.totalRuns || 0 : (workflow.totalRuns || 0) + 1,
      execution.status,
      execution.finishedAt || execution.startedAt,
      new Date().toISOString(),
      workflowId
    );
    return this.findById(workflowId);
  },
  removeExecution(workflowId, runId) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const workflowRow = db.prepare('SELECT executionHistory FROM workflows WHERE id = ?').get(workflowId);
      if (!workflowRow) {
        db.exec('ROLLBACK');
        return { status: 'workflow-not-found' };
      }

      let history = [];
      try { history = JSON.parse(workflowRow.executionHistory || '[]'); } catch (_) {}
      const historyHasRun = history.some((run) => run.id === runId);
      const run = db.prepare('SELECT status FROM workflow_runs WHERE id = ? AND workflowId = ?').get(runId, workflowId);
      if (!historyHasRun && !run) {
        db.exec('ROLLBACK');
        return { status: 'run-not-found' };
      }
      if (run && ['running', 'waiting_for_approval'].includes(run.status)) {
        db.exec('ROLLBACK');
        return { status: 'run-active' };
      }
      if (history.some((item) => item.id === runId && ['running', 'waiting_for_approval'].includes(item.status))) {
        db.exec('ROLLBACK');
        return { status: 'run-active' };
      }

      db.prepare('UPDATE workflows SET executionHistory = ?, updatedAt = ? WHERE id = ?')
        .run(JSON.stringify(history.filter((item) => item.id !== runId)), new Date().toISOString(), workflowId);
      db.prepare('DELETE FROM workflow_runs WHERE id = ? AND workflowId = ?').run(runId, workflowId);
      db.exec('COMMIT');
      return { status: 'deleted' };
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      throw error;
    }
  },
  pruneExecutionHistoryBefore(cutoff) {
    const workflows = db.prepare('SELECT id, executionHistory FROM workflows').all();
    let removed = 0;
    for (const workflow of workflows) {
      let history = [];
      try { history = JSON.parse(workflow.executionHistory || '[]'); } catch (_) {}
      const retained = history.filter((run) => !run.finishedAt || run.startedAt >= cutoff);
      if (retained.length !== history.length) {
        removed += history.length - retained.length;
        db.prepare('UPDATE workflows SET executionHistory = ?, updatedAt = ? WHERE id = ?')
          .run(JSON.stringify(retained), new Date().toISOString(), workflow.id);
      }
    }
    return removed;
  },
  removeTaskExecution(taskId) {
    const workflows = db.prepare('SELECT id, nodes, executionHistory FROM workflows').all();
    let removed = 0;
    for (const workflow of workflows) {
      let nodes = [];
      let history = [];
      try { nodes = JSON.parse(workflow.nodes || '[]'); } catch (_) {}
      try { history = JSON.parse(workflow.executionHistory || '[]'); } catch (_) {}

      let changed = false;
      const updatedNodes = nodes.map((node) => {
        if (!Array.isArray(node.executionHistory)) return node;
        const executionHistory = node.executionHistory.filter((execution) => execution.id !== taskId);
        if (executionHistory.length === node.executionHistory.length) return node;
        removed += node.executionHistory.length - executionHistory.length;
        changed = true;
        return { ...node, executionHistory };
      });

      const updatedHistory = history.map((execution) => {
        if (!Array.isArray(execution.logs)) return execution;
        const logs = execution.logs.filter((line) => !String(line).includes(taskId));
        if (logs.length === execution.logs.length) return execution;
        removed += execution.logs.length - logs.length;
        changed = true;
        return { ...execution, logs };
      });

      if (changed) {
        db.prepare('UPDATE workflows SET nodes = ?, executionHistory = ?, updatedAt = ? WHERE id = ?')
          .run(JSON.stringify(updatedNodes), JSON.stringify(updatedHistory), new Date().toISOString(), workflow.id);
      }
    }
    return removed;
  },
  delete(workflowId) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const workflow = db.prepare('SELECT id FROM workflows WHERE id = ?').get(workflowId);
      if (!workflow) {
        db.exec('ROLLBACK');
        return { status: 'not-found' };
      }
      const activeRun = db.prepare("SELECT id FROM workflow_runs WHERE workflowId = ? AND status IN ('running', 'waiting_for_approval') LIMIT 1").get(workflowId);
      if (activeRun) {
        db.exec('ROLLBACK');
        return { status: 'active' };
      }
      db.prepare('DELETE FROM workflow_runs WHERE workflowId = ?').run(workflowId);
      db.prepare('DELETE FROM workflows WHERE id = ?').run(workflowId);
      db.exec('COMMIT');
      return { status: 'deleted' };
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      throw error;
    }
  }
};

export default WorkflowModel;
