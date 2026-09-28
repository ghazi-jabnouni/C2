import { CredentialModel } from '../models/credential.model.js';
import { EnvironmentModel } from '../models/environment.model.js';
import { InventoryModel } from '../models/inventory.model.js';
import { MailSettingsModel } from '../models/mail-settings.model.js';
import { TemplateModel } from '../models/template.model.js';

function parseObject(value, label) {
  const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

function checkCredentialConfiguration(credential) {
  const requiredFields = {
    ssh_key: ['sshKey'],
    vault_password: ['vaultPassword'],
    cloud_token: ['secretToken'],
    password: ['password'],
    token: ['secretToken'],
    active_directory: ['username', 'password'],
    microsoft: ['msClientId', 'msClientSecret', 'msTenant']
  }[credential.type] || [];
  return requiredFields.filter((field) => !String(credential[field] || '').trim());
}

function resolveValue(path, values) {
  return String(path).split('.').reduce((current, key) => current?.[key], values);
}

function interpolate(value, values) {
  return String(value || '').replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => {
    const resolved = resolveValue(key, values);
    return resolved === undefined || resolved === null ? '' : String(resolved);
  });
}

function findMissingPlaceholders(value, values) {
  const missing = new Set();
  const visit = (item) => {
    if (typeof item === 'string') {
      for (const match of item.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
        const resolved = resolveValue(match[1], values);
        if (resolved === undefined || resolved === null || resolved === '') missing.add(match[1]);
      }
    } else if (Array.isArray(item)) {
      item.forEach(visit);
    } else if (item && typeof item === 'object') {
      Object.values(item).forEach(visit);
    }
  };
  visit(value);
  return [...missing];
}

function reachableNodes(workflow, startNodeId) {
  const nodes = workflow.nodes || [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (workflow.edges || []).filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
  const roots = startNodeId
    ? [startNodeId]
    : nodes.filter((node) => !edges.some((edge) => edge.to === node.id)).map((node) => node.id);
  const queue = roots.length ? [...roots] : nodes.slice(0, 1).map((node) => node.id);
  const visited = new Set();
  while (queue.length) {
    const nodeId = queue.shift();
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    edges.filter((edge) => edge.from === nodeId).forEach((edge) => queue.push(edge.to));
  }
  return nodes.filter((node) => visited.has(node.id));
}

export function validateWorkflowPreflight(workflow, options = {}) {
  const checks = [];
  const addCheck = (name, status, message, nodeId) => checks.push({ name, status, message, nodeId });
  const extraVars = options.extraVars || {};
  const runtimeValues = {
    ...extraVars,
    variables: extraVars,
    vars: extraVars,
    workflow_name: workflow.name,
    workflow_id: workflow.id,
    status: 'running'
  };
  const nodes = reachableNodes(workflow, options.startNodeId);

  if (!nodes.length) {
    addCheck('Workflow', 'error', 'No executable workflow nodes were found.');
    return checks;
  }
  addCheck('Workflow', 'pass', `${nodes.length} reachable node${nodes.length === 1 ? '' : 's'} selected for execution.`);

  let mailSettings;
  for (const node of nodes) {
    if (node.type === 'playbook') {
      const template = node.templateId ? TemplateModel.findById(node.templateId) : null;
      if (!template) {
        addCheck('Task template', 'error', `Playbook node '${node.label}' has no valid task template.`, node.id);
        continue;
      }
      addCheck('Task template', 'pass', `${template.name} is available.`, node.id);

      let templateVars;
      try {
        templateVars = parseObject(template.extraVars, `Extra variables for '${template.name}'`);
        addCheck('Variable configuration', 'pass', `Default variables for '${template.name}' are valid JSON.`, node.id);
      } catch (error) {
        addCheck('Variable configuration', 'error', error.message, node.id);
        templateVars = {};
      }

      let inventory = null;
      if (template.inventoryId) {
        inventory = InventoryModel.findById(template.inventoryId);
        addCheck(
          'Inventory',
          inventory && String(inventory.inventoryContent || '').trim() ? 'pass' : 'error',
          inventory ? (inventory.inventoryContent ? `${inventory.name} is available.` : `${inventory.name} has no inventory content.`) : `Inventory '${template.inventoryId}' no longer exists.`,
          node.id
        );
      } else {
        addCheck('Inventory', 'warning', `No inventory is selected for '${template.name}'; execution will use its local fallback inventory.`, node.id);
      }

      const credentialId = inventory?.credentialId || template.credentialId;
      if (credentialId) {
        const credential = CredentialModel.findById(credentialId);
        const missingCredentialFields = credential ? checkCredentialConfiguration(credential) : [];
        addCheck(
          'Credential',
          !credential ? 'error' : missingCredentialFields.length ? 'error' : 'pass',
          !credential
            ? `Credential '${credentialId}' no longer exists.`
            : missingCredentialFields.length
              ? `Credential '${credential.name}' is missing required fields: ${missingCredentialFields.join(', ')}.`
              : `${credential.name} is available and has the required fields.`,
          node.id
        );
      } else {
        addCheck('Credential', 'warning', `No credential is selected for '${template.name}'.`, node.id);
      }

      let environment = null;
      if (template.environmentId) {
        environment = EnvironmentModel.findById(template.environmentId);
        addCheck(
          'Environment',
          environment ? 'pass' : 'error',
          environment ? `${environment.name} is available.` : `Environment '${template.environmentId}' no longer exists.`,
          node.id
        );
      }
      const availableVars = {
        ...(environment?.variables || {}),
        ...(environment?.secrets || {}),
        ...templateVars,
        ...extraVars
      };
      const requiredVars = Array.isArray(template.requiredVars) ? template.requiredVars : [];
      const missingVars = requiredVars.filter((name) => {
        const value = resolveValue(name, availableVars);
        return value === undefined || value === null || value === '';
      });
      addCheck(
        'Required variables',
        missingVars.length ? 'error' : 'pass',
        missingVars.length ? `Missing required variables: ${missingVars.join(', ')}.` : `${requiredVars.length} required variable${requiredVars.length === 1 ? '' : 's'} satisfied.`,
        node.id
      );
    } else if (node.type === 'notification' || node.type === 'hook') {
      const nodeValues = { ...runtimeValues, node_id: node.id, node_label: node.label };
      const unresolved = findMissingPlaceholders(node.hookUrl, nodeValues);
      if (!node.hookUrl?.trim()) {
        addCheck('Webhook endpoint', 'error', `Webhook node '${node.label}' has no endpoint.`, node.id);
      } else if (unresolved.length) {
        addCheck('Webhook endpoint', 'error', `Webhook endpoint has unresolved variables: ${unresolved.join(', ')}.`, node.id);
      } else {
        try {
          const url = new URL(interpolate(node.hookUrl, nodeValues));
          const valid = ['http:', 'https:'].includes(url.protocol);
          addCheck('Webhook endpoint', valid ? 'pass' : 'error', valid ? 'Endpoint is a valid HTTP(S) URL; no test request was sent.' : 'Webhook endpoint must use HTTP or HTTPS.', node.id);
        } catch {
          addCheck('Webhook endpoint', 'error', 'Webhook endpoint is not a valid URL.', node.id);
        }
      }
      const missingNodeVars = findMissingPlaceholders([node.webhookHeaders || '{}', node.webhookBody || ''], nodeValues);
      addCheck(
        'Webhook variables',
        missingNodeVars.length ? 'error' : 'pass',
        missingNodeVars.length ? `Unresolved webhook variables: ${missingNodeVars.join(', ')}.` : 'Webhook body and headers have no unresolved variables.',
        node.id
      );
      try {
        const headers = parseObject(node.webhookHeaders, `Headers for '${node.label}'`);
        if (Object.values(headers).some((value) => typeof value !== 'string')) throw new Error('Webhook header values must be strings.');
        if (node.webhookBody?.trim()) JSON.parse(node.webhookBody);
        addCheck('Webhook payload', 'pass', 'Headers and request body are valid JSON.', node.id);
      } catch (error) {
        addCheck('Webhook payload', 'error', error.message, node.id);
      }
    } else if (node.type === 'email') {
      const missingNodeVars = findMissingPlaceholders([node.emailTo, node.emailCc, node.emailBcc, node.emailReplyTo, node.emailSubject, node.emailBody], runtimeValues);
      addCheck(
        'Email variables',
        missingNodeVars.length ? 'error' : 'pass',
        missingNodeVars.length ? `Unresolved email variables: ${missingNodeVars.join(', ')}.` : 'Email fields have no unresolved variables.',
        node.id
      );
      const recipient = interpolate(node.emailTo, runtimeValues);
      const recipients = recipient.split(',').map((address) => address.trim()).filter(Boolean);
      const validRecipients = recipients.length > 0 && recipients.every((address) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address));
      addCheck(
        'Email recipient',
        validRecipients ? 'pass' : 'error',
        validRecipients ? `${recipients.length} recipient${recipients.length === 1 ? '' : 's'} configured.` : (recipient ? 'Every email recipient must be a valid email address.' : `Email node '${node.label}' has no recipient.`),
        node.id
      );
      if (!mailSettings) mailSettings = MailSettingsModel.getTransportSettings();
      addCheck(
        'SMTP endpoint',
        mailSettings.host && Number.isInteger(mailSettings.port) && mailSettings.port > 0 ? 'pass' : 'error',
        mailSettings.host ? `SMTP host ${mailSettings.host}:${mailSettings.port} is configured; no test connection was made.` : 'SMTP is not configured in Mail Settings.',
        node.id
      );
    }
  }
  return checks;
}