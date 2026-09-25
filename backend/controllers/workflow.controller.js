import { WorkflowModel } from '../models/workflow.model.js';
import nodemailer from 'nodemailer';

function createMailTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
  if (!SMTP_HOST) throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.');
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: SMTP_SECURE === 'true' || SMTP_SECURE === '1',
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS || '' } : undefined
  });
}

async function sendWorkflowEmails(workflow, extraVars) {
  const emailNodes = (workflow.nodes || []).filter((node) => node.type === 'email');
  if (emailNodes.length === 0) return [];
  const transport = createMailTransport();
  const defaultFrom = process.env.SMTP_FROM || process.env.SMTP_USER;
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
