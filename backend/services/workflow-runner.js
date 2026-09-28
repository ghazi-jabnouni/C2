import { WorkflowRunModel } from '../models/workflow-run.model.js';
import { WorkflowModel } from '../models/workflow.model.js';
import { TaskModel } from '../models/task.model.js';
import { startTemplateExecution } from '../controllers/template.controller.js';
import { sendWorkflowEmails, sendWorkflowWebhook } from '../controllers/workflow.controller.js';
import { WorkflowRunEvents } from './workflow-run-events.js';

const activeRuns = new Set();
const approvalWaiters = new Map();

function publish(run) {
  WorkflowRunEvents.publish(run);
  return run;
}

function updateRun(runId, changes) {
  const run = WorkflowRunModel.update(runId, changes);
  return run ? publish(run) : null;
}

function appendLog(runId, message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  const run = WorkflowRunModel.appendLog(runId, line);
  if (!run) return null;
  publish(run);
  return run;
}

function getLogText(log) {
  if (typeof log === 'string') return log;
  if (log && typeof log === 'object') return [log.ts, log.level, log.msg].filter(Boolean).join(' ');
  return String(log);
}

function normalizeEdges(edges, nodes) {
  const ids = new Set(nodes.map((node) => node.id));
  return edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
}

async function waitForApproval(runId, workflow, node) {
  const run = WorkflowRunModel.findById(runId);
  const nodeStatuses = { ...run.nodeStatuses, [node.id]: 'waiting_for_approval' };
  updateRun(runId, { status: 'waiting_for_approval', currentNodeId: node.id, waitingNodeId: node.id, nodeStatuses });
  appendLog(runId, `[APPROVAL REQUIRED] ${node.approvalMessage || `Approve workflow step '${node.label}' to continue.`}`);
  return new Promise((resolve) => approvalWaiters.set(runId, { nodeId: node.id, resolve }));
}

async function runPlaybook(runId, workflow, node, variables, limit) {
  if (!node.templateId) throw new Error(`Playbook node '${node.label}' has no task template.`);
  if (variables.service_name || variables.sr_number) {
    appendLog(runId, `[TASK CONTEXT] ${variables.service_name || 'Service not specified'}${variables.sr_number ? ` | SR ${variables.sr_number}` : ''}`);
  }
  if (variables.handoff_message) appendLog(runId, `[HANDOFF MESSAGE] ${variables.handoff_message}`);
  const task = startTemplateExecution(node.templateId, {
    extraVars: variables,
    limit: limit || 'all',
    triggeredBy: `Workflow: ${workflow.name}`
  });
  if (!task) throw new Error(`Task template for '${node.label}' was not found.`);
  appendLog(runId, `[TASK STARTED] ${task.id} (${node.label})`);

  let logIndex = 0;
  let current = task;
  while (current?.status === 'running') {
    const newLogs = (current.logs || []).slice(logIndex);
    if (newLogs.length) {
      newLogs.forEach((line) => appendLog(runId, `[TASK ${task.id}] ${getLogText(line)}`));
      logIndex += newLogs.length;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
    current = TaskModel.findById(task.id);
  }
  const remainingLogs = (current?.logs || []).slice(logIndex);
  remainingLogs.forEach((line) => appendLog(runId, `[TASK ${task.id}] ${getLogText(line)}`));
  return { status: current?.status === 'success' ? 'success' : 'failed', taskId: task.id };
}

async function executeNode(runId, workflow, node, variables, limit) {
  if (node.type === 'approval') {
    return { status: 'decision', decision: await waitForApproval(runId, workflow, node) };
  }
  if (node.type === 'playbook') return runPlaybook(runId, workflow, node, variables, limit);
  if (node.type === 'email') {
    const results = await sendWorkflowEmails(workflow, variables, node.id);
    results.forEach((result) => appendLog(runId, `[EMAIL SENT] ${node.emailTo} (Message ID: ${result.messageId})`));
  }
  if (node.type === 'notification' || node.type === 'hook') {
    const result = await sendWorkflowWebhook(workflow, node, {
      ...variables,
      workflow_limit: limit || 'all',
      triggered_by: 'API'
    });
    appendLog(runId, `[WEBHOOK SENT] ${node.label} (HTTP ${result.status})`);
    if (result.responseBody) appendLog(runId, `[WEBHOOK RESPONSE] ${result.responseBody}`);
  }
  return { status: 'success' };
}

async function executeRun(runId, workflow, options) {
  if (activeRuns.has(runId)) return;
  activeRuns.add(runId);
  const nodes = workflow.nodes || [];
  const edges = normalizeEdges(workflow.edges || [], nodes);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Set(edges.map((edge) => edge.to));
  const nodeStatuses = Object.fromEntries(nodes.map((node) => [node.id, 'idle']));
  let queue = options.startNodeId
    ? [options.startNodeId]
    : nodes.filter((node) => !incoming.has(node.id)).map((node) => node.id);
  if (queue.length === 0 && nodes.length > 0) queue = [nodes[0].id];
  const queued = new Set(queue);
  const processed = new Set();
  const startedAt = Date.now();
  let outcome = 'success';
  let activeCount = 0;

  try {
    appendLog(runId, `[WORKFLOW STARTED] ${workflow.name} (${nodes.length} nodes)`);
    while (queue.length > 0) {
      const nodeId = queue.shift();
      queued.delete(nodeId);
      if (processed.has(nodeId)) continue;
      const node = nodeMap.get(nodeId);
      if (!node) continue;
      processed.add(nodeId);
      activeCount += 1;
      nodeStatuses[nodeId] = 'running';
      updateRun(runId, { nodeStatuses: { ...nodeStatuses }, currentNodeId: nodeId, totalStages: activeCount });
      appendLog(runId, `[NODE STARTED] ${node.label} (${node.type})`);

      let result;
      try {
        result = await executeNode(runId, workflow, node, options.extraVars || {}, options.limit || 'all');
        if (result.status === 'decision') {
          const approved = result.decision === 'yes';
          result = { status: approved ? 'success' : 'failed' };
          appendLog(runId, `[APPROVAL ${approved ? 'GRANTED' : 'REJECTED'}] ${node.label}`);
          updateRun(runId, { status: 'running', waitingNodeId: null });
        }
      } catch (error) {
        result = { status: 'failed' };
        appendLog(runId, `[NODE ERROR] ${node.label}: ${error instanceof Error ? error.message : String(error)}`);
      }

      nodeStatuses[nodeId] = result.status;
      if (result.status === 'failed') outcome = 'failed';
      updateRun(runId, { nodeStatuses: { ...nodeStatuses }, currentNodeId: null });
      appendLog(runId, `[NODE ${result.status.toUpperCase()}] ${node.label}`);

      for (const edge of edges.filter((item) => item.from === nodeId)) {
        const follows = result.status === 'success'
          ? edge.type === 'success' || edge.type === 'always'
          : edge.type === 'failure' || edge.type === 'always';
        if (follows) {
          if (!processed.has(edge.to) && !queued.has(edge.to)) {
            queue.push(edge.to);
            queued.add(edge.to);
            appendLog(runId, `[BRANCH ${edge.type.toUpperCase()}] Continuing to ${nodeMap.get(edge.to)?.label || edge.to}`);
          }
        } else {
          appendLog(runId, `[BRANCH BYPASSED] ${nodeMap.get(edge.to)?.label || edge.to} (${edge.type})`);
        }
      }
    }

    for (const node of nodes) {
      if (nodeStatuses[node.id] === 'idle') nodeStatuses[node.id] = 'skipped';
    }
    const finishedAt = new Date().toISOString();
    const duration = `${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s`;
    const finalStatus = outcome;
    const finalRun = updateRun(runId, {
      status: finalStatus,
      finishedAt,
      duration,
      currentNodeId: null,
      waitingNodeId: null,
      nodeStatuses: { ...nodeStatuses }
    });
    appendLog(runId, `[WORKFLOW ${finalStatus.toUpperCase()}] Completed in ${duration}`);
    const completedRun = WorkflowRunModel.findById(runId);
    WorkflowModel.recordExecution(workflow.id, completedRun);
    publish(completedRun || finalRun);
  } catch (error) {
    const finishedAt = new Date().toISOString();
    appendLog(runId, `[WORKFLOW ERROR] ${error instanceof Error ? error.message : String(error)}`);
    const failedRun = updateRun(runId, {
      status: 'failed',
      finishedAt,
      duration: `${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s`,
      waitingNodeId: null
    });
    if (failedRun) WorkflowModel.recordExecution(workflow.id, WorkflowRunModel.findById(runId));
  } finally {
    activeRuns.delete(runId);
    approvalWaiters.delete(runId);
  }
}

export const WorkflowRunner = {
  start(workflow, options = {}) {
    if (!workflow?.nodes?.length) {
      const error = new Error('Workflow has no nodes to execute.');
      error.statusCode = 400;
      throw error;
    }
    const existingRun = WorkflowRunModel.findByWorkflow(workflow.id)
      .find((run) => run.status === 'running' || run.status === 'waiting_for_approval');
    if (existingRun) {
      const error = new Error(`Workflow already has an active run (${existingRun.id}).`);
      error.statusCode = 409;
      throw error;
    }
    if (options.startNodeId && !workflow.nodes.some((node) => node.id === options.startNodeId)) {
      const error = new Error('Start node was not found in this workflow.');
      error.statusCode = 400;
      throw error;
    }
    const serviceName = String(options.serviceName || options.extraVars?.service_name || '').trim();
    const srNumber = String(options.srNumber || options.extraVars?.sr_number || '').trim();
    const handoffMessage = String(options.handoffMessage || options.extraVars?.handoff_message || '').trim();
    const extraVars = {
      ...(options.extraVars || {}),
      ...(serviceName ? { service_name: serviceName } : {}),
      ...(srNumber ? { sr_number: srNumber } : {}),
      ...(handoffMessage ? { handoff_message: handoffMessage } : {})
    };
    const run = WorkflowRunModel.create({
      workflowId: workflow.id,
      workflowName: workflow.name,
      triggeredBy: options.triggeredBy || 'API',
      totalNodes: workflow.nodes.length,
      startNodeId: options.startNodeId,
      serviceName,
      srNumber,
      handoffMessage
    });
    if (serviceName || srNumber) {
      appendLog(run.id, `[REQUEST] ${serviceName || 'Service not specified'}${srNumber ? ` | SR ${srNumber}` : ''}`);
    }
    if (handoffMessage) appendLog(run.id, `[HANDOFF MESSAGE] ${handoffMessage}`);
    WorkflowModel.recordExecution(workflow.id, run);
    publish(run);
    setImmediate(() => void executeRun(run.id, workflow, { ...options, extraVars }));
    return run;
  },

  get(runId) {
    return WorkflowRunModel.findById(runId);
  },

  approve(runId, nodeId, decision) {
    const waiter = approvalWaiters.get(runId);
    if (!waiter || waiter.nodeId !== nodeId) return false;
    approvalWaiters.delete(runId);
    waiter.resolve(decision);
    return true;
  },

  recoverInterruptedRuns() {
    const interruptedRuns = WorkflowRunModel.markInterruptedRuns();
    interruptedRuns.forEach((run) => WorkflowModel.recordExecution(run.workflowId, run));
    return interruptedRuns;
  }
};

export default WorkflowRunner;