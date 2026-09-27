import { WorkflowModel } from '../models/workflow.model.js';
import { MailSettingsModel } from '../models/mail-settings.model.js';
import nodemailer from 'nodemailer';

function createMailTransport(settings) {
  if (!settings.host) throw new Error('SMTP is not configured. Set it in Mail Settings.');
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.username ? { user: settings.username, pass: settings.password || '' } : undefined
  });
}

async function sendWorkflowEmails(workflow, extraVars, nodeId) {
  const allEmailNodes = (workflow.nodes || []).filter((node) => node.type === 'email');
  const emailNodes = nodeId ? allEmailNodes.filter((node) => node.id === nodeId) : allEmailNodes;
  if (nodeId && emailNodes.length === 0) throw new Error(`Email node '${nodeId}' was not found in this workflow.`);
  if (emailNodes.length === 0) return [];
  const mailSettings = MailSettingsModel.getTransportSettings();
  const transport = createMailTransport(mailSettings);
  const defaultFrom = mailSettings.fromAddress || mailSettings.username;
  const replaceVariables = (value) => String(value || '')
    .replace(/\{\{\s*workflow_name\s*\}\}/g, workflow.name)
    .replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => String(extraVars?.[key] ?? ''));

  const results = [];
  for (const node of emailNodes) {
    if (!node.emailTo?.trim()) throw new Error(`Email node '${node.label}' has no recipient.`);
    const info = await transport.sendMail({
      from: node.emailFrom || defaultFrom,
      to: replaceVariables(node.emailTo),
      cc: replaceVariables(node.emailCc),
      bcc: replaceVariables(node.emailBcc),
      replyTo: replaceVariables(node.emailReplyTo),
      subject: replaceVariables(node.emailSubject || workflow.name),
      text: replaceVariables(node.emailBody || '')
    });
    results.push({ nodeId: node.id, messageId: info.messageId, accepted: info.accepted });
  }
  return results;
}

function resolveWebhookValue(value, variables) {
  return String(value).split('.').reduce((current, key) => current?.[key], variables);
}

function interpolateWebhookValue(value, variables) {
  if (typeof value === 'string') {
    const exactMatch = value.match(/^\{\{\s*([\w.-]+)\s*\}\}$/);
    if (exactMatch) return resolveWebhookValue(exactMatch[1], variables) ?? '';
    return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => String(resolveWebhookValue(key, variables) ?? ''));
  }
  if (Array.isArray(value)) return value.map((item) => interpolateWebhookValue(item, variables));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolateWebhookValue(item, variables)]));
  }
  return value;
}

async function sendWorkflowWebhook(workflow, node, triggerVariables = {}) {
  if (!node.hookUrl?.trim()) throw new Error(`Webhook node '${node.label}' has no URL.`);
  const variables = {
    ...triggerVariables,
    variables: triggerVariables,
    vars: triggerVariables,
    workflow_name: workflow.name,
    workflow_id: workflow.id,
    node_id: node.id,
    node_label: node.label,
    status: triggerVariables.status || 'running'
  };
  const url = interpolateWebhookValue(node.hookUrl, variables);
  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Webhook URL must use HTTP or HTTPS.');

  let configuredHeaders = {};
  try {
    configuredHeaders = JSON.parse(node.webhookHeaders || '{}');
  } catch {
    throw new Error('Webhook headers must be valid JSON.');
  }
  if (!configuredHeaders || Array.isArray(configuredHeaders) || typeof configuredHeaders !== 'object') {
    throw new Error('Webhook headers must be a JSON object.');
  }
  const headers = {};
  for (const [key, value] of Object.entries(configuredHeaders)) {
    if (typeof value !== 'string') throw new Error(`Webhook header '${key}' must have a string value.`);
    headers[key] = interpolateWebhookValue(value, variables);
  }

  let body;
  if (node.webhookBody?.trim()) {
    let parsedBody;
    try {
      parsedBody = JSON.parse(node.webhookBody);
    } catch {
      throw new Error('Webhook body must be valid JSON.');
    }
    body = JSON.stringify(interpolateWebhookValue(parsedBody, variables));
    if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(15000)
  });
  const responseBody = (await response.text()).slice(0, 1000);
  if (!response.ok) {
    throw new Error(`Webhook returned HTTP ${response.status}${responseBody ? `: ${responseBody}` : ''}`);
  }
  return { status: response.status, statusText: response.statusText, responseBody };
}

export const WorkflowController = {
  list: (req, res) => {
    try { res.json(WorkflowModel.findAll()); } catch (err) { res.status(500).json({ error: err.message }); }
  },
  create: (req, res) => {
    try {
      if (!req.body.name) return res.status(400).json({ error: 'Name is required' });
      res.status(201).json(WorkflowModel.create(req.body));
    } catch (err) { res.status(500).json({ error: err.message }); }
  },
  update: (req, res) => {
    try {
      const updated = WorkflowModel.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Workflow not found' });
      res.json(updated);
    } catch (err) { res.status(500).json({ error: err.message }); }
  },
  run: (req, res) => {
    try {
      const workflow = WorkflowModel.findById(req.params.id);
      if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
      const extraVars = req.body?.extraVars || {};
      sendWorkflowEmails(workflow, extraVars).then((emailResults) => {
        res.status(202).json({
          message: 'Workflow email steps accepted',
          workflowId: workflow.id,
          workflowName: workflow.name,
          triggeredBy: req.body?.triggeredBy || 'API',
          extraVars,
          emailResults,
          status: 'queued'
        });
      }).catch((err) => {
        res.status(502).json({ error: err.message });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  sendEmailNode: (req, res) => {
    try {
      const workflow = WorkflowModel.findById(req.params.id);
      if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
      const node = (workflow.nodes || []).find((item) => item.id === req.params.nodeId && item.type === 'email');
      if (!node) return res.status(404).json({ error: 'Email node not found' });

      sendWorkflowEmails(workflow, req.body?.extraVars || {}, node.id).then((emailResults) => {
        res.json({ emailResults });
      }).catch((err) => {
        res.status(502).json({ error: err.message });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  sendWebhookNode: async (req, res) => {
    try {
      const workflow = WorkflowModel.findById(req.params.id);
      if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
      const node = (workflow.nodes || []).find((item) => item.id === req.params.nodeId && item.type === 'notification');
      if (!node) return res.status(404).json({ error: 'Webhook node not found' });
      const variables = req.body?.variables && typeof req.body.variables === 'object' ? req.body.variables : {};
      const result = await sendWorkflowWebhook(workflow, node, variables);
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  },
  remove: (req, res) => {
    try {
      if (!WorkflowModel.delete(req.params.id)) return res.status(404).json({ error: 'Workflow not found' });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },
  approvalDecision: (req, res) => {
    try {
      const { id, nodeId } = req.params;
      const { decision } = req.body;
      const wf = WorkflowModel.findById(id);
      if (!wf) return res.status(404).json({ error: 'Workflow not found' });
      const nodes = wf.nodes.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            status: decision === 'yes' ? 'success' : 'failed',
            approvalDecision: decision
          };
        }
        return n;
      });
      const updated = WorkflowModel.update(id, { ...wf, nodes });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};
