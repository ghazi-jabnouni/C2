import crypto from 'node:crypto';
import db from '../config/db.js';

function parse(row) {
  if (!row) return null;
  return { ...JSON.parse(row.runData), id: row.id, workflowId: row.workflowId, status: row.status };
}

export const WorkflowRunModel = {
  create({ workflowId, workflowName, triggeredBy, totalNodes, startNodeId }) {
    const id = `wfr-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const run = {
      id,
      workflowId,
      workflowName,
      status: 'running',
      startedAt: now,
      finishedAt: null,
      duration: 'running...',
      triggeredBy,
      totalStages: 0,
      totalNodes,
      startNodeId: startNodeId || null,
      currentNodeId: null,
      waitingNodeId: null,
      nodeStatuses: {},
      logs: []
    };
    db.prepare('INSERT INTO workflow_runs (id, workflowId, status, runData, startedAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, workflowId, run.status, JSON.stringify(run), now, now);
    return run;
  },

  findById(id) {
    return parse(db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(id));
  },

  findByWorkflow(workflowId) {
    return db.prepare('SELECT * FROM workflow_runs WHERE workflowId = ? ORDER BY startedAt DESC').all(workflowId).map(parse);
  },

  deleteFinishedBefore(cutoff) {
    return db.prepare("DELETE FROM workflow_runs WHERE startedAt < ? AND status NOT IN ('running', 'waiting_for_approval')")
      .run(cutoff).changes;
  },

  removeTaskLogs(taskId) {
    const rows = db.prepare('SELECT id, runData FROM workflow_runs').all();
    let removed = 0;
    for (const row of rows) {
      let run;
      try { run = JSON.parse(row.runData); } catch (_) { continue; }
      if (!Array.isArray(run.logs)) continue;
      const logs = run.logs.filter((line) => !String(line).includes(taskId));
      if (logs.length === run.logs.length) continue;
      removed += run.logs.length - logs.length;
      run.logs = logs;
      db.prepare('UPDATE workflow_runs SET runData = ?, updatedAt = ? WHERE id = ?')
        .run(JSON.stringify(run), new Date().toISOString(), row.id);
    }
    return removed;
  },

  update(id, changes) {
    const current = this.findById(id);
    if (!current) return null;
    const next = { ...current, ...changes };
    db.prepare('UPDATE workflow_runs SET status = ?, runData = ?, updatedAt = ? WHERE id = ?')
      .run(next.status, JSON.stringify(next), new Date().toISOString(), id);
    return next;
  },

  appendLog(id, log) {
    const current = this.findById(id);
    if (!current) return null;
    return this.update(id, { logs: [...current.logs, log] });
  },

  markInterruptedRuns() {
    const rows = db.prepare("SELECT id FROM workflow_runs WHERE status IN ('running', 'waiting_for_approval')").all();
    const interruptedRuns = [];
    for (const { id } of rows) {
      const current = this.findById(id);
      const now = new Date().toISOString();
      const interrupted = {
        ...current,
        status: 'failed',
        finishedAt: now,
        duration: `${Math.max(1, Math.round((Date.now() - new Date(current.startedAt).getTime()) / 1000))}s`,
        waitingNodeId: null,
        logs: [...current.logs, `[${new Date().toLocaleTimeString()}] [WORKFLOW INTERRUPTED] Backend restarted before this run completed.`]
      };
      interruptedRuns.push(this.update(id, interrupted));
    }
    return interruptedRuns.filter(Boolean);
  }
};

export default WorkflowRunModel;