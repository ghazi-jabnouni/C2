import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { TemplateModel } from '../models/template.model.js';
import { TaskModel } from '../models/task.model.js';
import { InventoryModel } from '../models/inventory.model.js';
import { RepositoryModel } from '../models/repository.model.js';
import { EnvironmentModel } from '../models/environment.model.js';
import { CredentialModel } from '../models/credential.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspacesDir = path.resolve(__dirname, '../workspaces');
if (!fs.existsSync(workspacesDir)) {
  try { fs.mkdirSync(workspacesDir, { recursive: true }); } catch (_) {}
}

export const TemplateController = {
  list: (req, res) => {
    try {
      res.json(TemplateModel.findAll());
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to list templates' });
    }
  },

  getById: (req, res) => {
    try {
      const tmpl = TemplateModel.findById(req.params.id);
      if (!tmpl) return res.status(404).json({ error: 'Template not found' });
      res.json(tmpl);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to get template' });
    }
  },

  create: (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const created = TemplateModel.create(req.body);
      res.status(201).json(created);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create template' });
    }
  },

  update: (req, res) => {
    try {
      const existing = TemplateModel.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Template not found' });
      const updated = TemplateModel.update(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update template' });
    }
  },

  remove: (req, res) => {
    try {
      const success = TemplateModel.delete(req.params.id);
      if (!success) return res.status(404).json({ error: 'Template not found' });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete template' });
    }
  },

    run: (req, res) => {
    try {
      const tmpl = TemplateModel.findById(req.params.id);
      if (!tmpl) return res.status(404).json({ error: 'Template not found' });

      // Resolve inventory name and content
      let inventoryName = '';
      let inventoryContent = '';
      if (tmpl.inventoryId) {
        try {
          const inv = InventoryModel.findById(tmpl.inventoryId);
          if (inv) {
            inventoryName = inv.name;
            inventoryContent = inv.inventoryContent || '';
          }
        } catch (_) {}
      }

      const limitOverride = req.body?.limit || tmpl.limit || 'all';

      const task = TaskModel.create({
        templateId: tmpl.id,
        templateName: tmpl.name,
        type: tmpl.type || 'ansible',
        triggeredBy: req.body?.triggeredBy || 'Operator',
        inventoryName,
        playbook: tmpl.playbook,
        extraVars: req.body?.extraVars || tmpl.extraVars || '{}',
        limit: limitOverride
      });

      // Simulate execution based on template type (Ansible or Terraform)
      if (tmpl.type === 'terraform') {
        simulateTerraformExecution(task.id, tmpl, limitOverride);
      } else {
        simulateExecution(task.id, tmpl, inventoryContent, limitOverride);
      }

      res.status(201).json(task);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to run template' });
    }
  }
};

// Helper to parse GitHub web URLs into clean git repo URL and optional relative path
function parseGitUrl(rawUrl) {
  if (!rawUrl) return { cleanGitUrl: '', subPath: '' };
  let urlStr = rawUrl.trim();
  
  // Handle https://github.com/owner/repo/tree/branch/path or /blob/branch/path
  const ghMatch = urlStr.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:tree|blob)\/([^/]+)\/?(.*)$/i);
  if (ghMatch) {
    const owner = ghMatch[1];
    const repo = ghMatch[2].replace(/\.git$/i, '');
    const branch = ghMatch[3];
    const subPath = ghMatch[4];
    return {
      cleanGitUrl: `https://github.com/${owner}/${repo}.git`,
      extractedBranch: branch,
      subPath: subPath
    };
  }

  // Strip trailing slashes
  urlStr = urlStr.replace(/\/$/, '');
  if (urlStr.includes('github.com') && !urlStr.endsWith('.git')) {
    urlStr += '.git';
  }

  return { cleanGitUrl: urlStr, subPath: '' };
}

// Helper to find target playbook inside workspace recursively
function findPlaybookInWorkspace(workspaceDir, targetPlaybook, subPath = '') {
  if (!fs.existsSync(workspaceDir)) return null;

  // 1. Check direct path with subPath if available
  if (subPath) {
    const directWithSub = path.join(workspaceDir, subPath, targetPlaybook);
    if (fs.existsSync(directWithSub) && fs.statSync(directWithSub).isFile()) return directWithSub;

    const subPathFile = path.join(workspaceDir, subPath);
    if (fs.existsSync(subPathFile) && fs.statSync(subPathFile).isFile()) return subPathFile;
  }

  // 2. Check direct path in root
  const directRoot = path.join(workspaceDir, targetPlaybook);
  if (fs.existsSync(directRoot) && fs.statSync(directRoot).isFile()) return directRoot;

  // 3. Search recursively for targetPlaybook or any .yml/.yaml file
  let foundFile = null;
  let firstYamlFile = null;

  function walk(dir) {
    if (foundFile) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) {}
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (entry.name.toLowerCase() === targetPlaybook.toLowerCase()) {
          foundFile = fullPath;
          return;
        }
        if (!firstYamlFile && (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml'))) {
          firstYamlFile = fullPath;
        }
      }
    }
  }

  walk(workspaceDir);
  return foundFile || firstYamlFile || null;
}

// Helper to parse host names from INI/YAML inventory content and filter by limit override
function parseInventoryHosts(inventoryContent, limit) {
  if (!inventoryContent || !inventoryContent.trim()) {
    if (limit && limit !== 'all' && limit !== '*') {
      return [limit.trim()];
    }
    return ['my_pc'];
  }

  const allHosts = [];
  const groupMap = {};
  let currentGroup = 'all';

  const lines = inventoryContent.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const groupMatch = line.match(/^\[([^\]]+)\]/);
    if (groupMatch) {
      currentGroup = groupMatch[1].trim();
      if (!groupMap[currentGroup]) groupMap[currentGroup] = [];
      continue;
    }

    const tokens = line.split(/\s+/);
    const hostToken = tokens[0];
    if (hostToken && !hostToken.includes('=') && !hostToken.startsWith('[')) {
      if (!allHosts.includes(hostToken)) {
        allHosts.push(hostToken);
      }
      if (!groupMap[currentGroup]) groupMap[currentGroup] = [];
      if (!groupMap[currentGroup].includes(hostToken)) {
        groupMap[currentGroup].push(hostToken);
      }
    }
  }

  if (allHosts.length === 0) {
    return (limit && limit !== 'all' && limit !== '*') ? [limit.trim()] : ['my_pc'];
  }

  if (!limit || limit.trim() === '' || limit.trim() === 'all' || limit.trim() === '*') {
    return allHosts;
  }

  const cleanedLimit = limit.trim();

  // 1. Direct group match (e.g. "webservers")
  if (groupMap[cleanedLimit] && groupMap[cleanedLimit].length > 0) {
    return groupMap[cleanedLimit];
  }

  // 2. Host name / comma separated limit list
  const items = cleanedLimit.split(/[\s,]+/).filter(Boolean);
  const matchedHosts = [];

  for (const item of items) {
    if (groupMap[item] && groupMap[item].length > 0) {
      groupMap[item].forEach(h => {
        if (!matchedHosts.includes(h)) matchedHosts.push(h);
      });
    } else if (allHosts.includes(item)) {
      if (!matchedHosts.includes(item)) matchedHosts.push(item);
    } else {
      if (!matchedHosts.includes(item)) matchedHosts.push(item);
    }
  }

  return matchedHosts.length > 0 ? matchedHosts : [cleanedLimit];
}

// Helper to extract task names from playbook YAML file
function parsePlaybookTasks(playbookPath) {
  const defaultTasks = ['Display Target PC Variable', 'Ping Target PC', 'Display Ping Results'];
  if (!fs.existsSync(playbookPath)) return defaultTasks;
  try {
    const content = fs.readFileSync(playbookPath, 'utf8');
    const taskNames = [];
    const nameMatches = content.matchAll(/-?\s*name:\s*(.+)/g);
    for (const match of nameMatches) {
      const taskName = match[1].trim().replace(/^["']|["']$/g, '');
      if (taskName && !taskName.toLowerCase().startsWith('execute') && !taskName.toLowerCase().includes('playbook')) {
        taskNames.push(taskName);
      }
    }
    return taskNames.length > 0 ? taskNames : defaultTasks;
  } catch (_) {
    return defaultTasks;
  }
}

// Simulates an Ansible run with realistic log output and Git repo retrieval
async function simulateExecution(taskId, tmpl, inventoryContent, limitOverride) {
  const playbook = tmpl.playbook || 'site.yml';
  const effectiveLimit = limitOverride || tmpl.limit || 'all';

  // Task workspace directory on Windows host
  const taskWorkspace = path.join(workspacesDir, taskId);
  try {
    if (!fs.existsSync(taskWorkspace)) {
      fs.mkdirSync(taskWorkspace, { recursive: true });
    }
  } catch (_) {}

  // Fetch repository & Git URL applied to template
  let rawGitUrl = tmpl.gitUrl || '';
  let repoName = tmpl.repositoryName || 'Ansible Git Repository';
  let branch = tmpl.branch || 'main';

  if (tmpl.repositoryId) {
    try {
      const repo = RepositoryModel.findById(tmpl.repositoryId);
      if (repo) {
        repoName = repo.name || repoName;
        rawGitUrl = repo.gitUrl || rawGitUrl;
        branch = repo.branch || branch;
      }
    } catch (_) {}
  }

  const { cleanGitUrl, extractedBranch, subPath } = parseGitUrl(rawGitUrl);
  const targetGitUrl = cleanGitUrl || rawGitUrl || `https://github.com/ansible-templates/${(tmpl.name || 'playbook').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.git`;
  const targetBranch = extractedBranch || branch || 'main';

  // ── Flush first logs IMMEDIATELY so frontend sees output right away ─────────
  const pushLog = (msg, level = 'info') => {
    try { TaskModel.appendLog(taskId, [{ ts: new Date().toISOString(), level, msg }]); } catch (_) {}
  };
  pushLog('TASK [Retrieve Playbook from Git Repository] ***');
  pushLog(`[Terminal] Task workspace: ${taskWorkspace}`);
  pushLog(`$ git clone --depth 1 -b ${targetBranch} ${targetGitUrl} <workspace>`);
  pushLog('');

  const initialLogLines = [];

  // Execute Git process on Windows Terminal
  await new Promise((resolve) => {
    const cmd = `git clone --depth 1 -b ${JSON.stringify(targetBranch)} ${JSON.stringify(targetGitUrl)} ${JSON.stringify(taskWorkspace)}`;
    exec(cmd, (error, stdout, stderr) => {
      if (stdout && stdout.trim()) {
        stdout.split('\n').filter(Boolean).forEach((l) => {
          initialLogLines.push({ ts: new Date().toISOString(), level: 'ok', msg: l.trim() });
        });
      }
      if (stderr && stderr.trim()) {
        stderr.split('\n').filter(Boolean).forEach((l) => {
          const isErr = error && (l.includes('fatal:') || l.includes('error:'));
          initialLogLines.push({ ts: new Date().toISOString(), level: isErr ? 'changed' : 'ok', msg: l.trim() });
        });
      }

      if (error) {
        initialLogLines.push({ ts: new Date().toISOString(), level: 'changed', msg: `[Terminal Output] Git process finished with status code ${error.code || 1}. Processing workspace files...` });
      } else {
        initialLogLines.push({ ts: new Date().toISOString(), level: 'ok', msg: `[Terminal Output] ok: [localhost] => Git repository cloned successfully.` });
      }

      // Find the real YAML playbook file inside cloned git repository
      const discoveredYamlPath = findPlaybookInWorkspace(taskWorkspace, playbook, subPath);

      try {
        const templateDir = tmpl.folderPath ? path.resolve(__dirname, '../../', tmpl.folderPath) : null;
        if (templateDir && !fs.existsSync(templateDir)) {
          fs.mkdirSync(templateDir, { recursive: true });
        }

        if (discoveredYamlPath && fs.existsSync(discoveredYamlPath)) {
          const realYamlContent = fs.readFileSync(discoveredYamlPath, 'utf8');
          initialLogLines.push({ ts: new Date().toISOString(), level: 'ok', msg: `ok: [localhost] => Discovered target playbook: ${path.basename(discoveredYamlPath)}` });

          // Write to task workspace
          const targetPbPath = path.join(taskWorkspace, playbook);
          fs.writeFileSync(targetPbPath, realYamlContent, 'utf8');

          // Sync to template directory (both playbook name and playbook.yml)
          if (templateDir) {
            fs.writeFileSync(path.join(templateDir, playbook), realYamlContent, 'utf8');
            fs.writeFileSync(path.join(templateDir, 'playbook.yml'), realYamlContent, 'utf8');
          }
        } else {
          // If no git playbook was found, create default placeholder
          const targetPbPath = path.join(taskWorkspace, playbook);
          if (!fs.existsSync(targetPbPath)) {
            const defaultContent = `# Playbook downloaded from ${targetGitUrl}\n- name: Execute ${tmpl.name}\n  hosts: all\n  tasks:\n    - name: Run task step\n      debug:\n        msg: "Playbook executed from task workspace"\n`;
            fs.writeFileSync(targetPbPath, defaultContent, 'utf8');
            if (templateDir) {
              fs.writeFileSync(path.join(templateDir, playbook), defaultContent, 'utf8');
              fs.writeFileSync(path.join(templateDir, 'playbook.yml'), defaultContent, 'utf8');
            }
          }
        }
      } catch (err) {
        console.error('[simulate] Error syncing discovered git playbook to template dir:', err);
      }

      // Assemble Task Workspace Runtime Environment
      try {
        // 1. Inventory (.ini & .yml)
        const invStr = inventoryContent || `# Task Inventory for ${taskId}\n[all]\nlocalhost ansible_connection=local\n`;
        fs.writeFileSync(path.join(taskWorkspace, 'inventory.ini'), invStr, 'utf8');
        fs.writeFileSync(path.join(taskWorkspace, 'inventory.yml'), invStr, 'utf8');

        // 2. Extra Vars (.yml & .json)
        const extraVarsObj = typeof tmpl.extraVars === 'string' ? JSON.parse(tmpl.extraVars || '{}') : (tmpl.extraVars || {});
        fs.writeFileSync(path.join(taskWorkspace, 'vars.json'), JSON.stringify(extraVarsObj, null, 2), 'utf8');
        const varsYamlLines = Object.entries(extraVarsObj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
        const varsYaml = `# Extra Variables for task ${taskId}\n${varsYamlLines.length > 0 ? varsYamlLines.join('\n') : '# No extra variables'}\n`;
        fs.writeFileSync(path.join(taskWorkspace, 'vars.yml'), varsYaml, 'utf8');

        // 3. Environment Variables & Secrets (.json & .yml)
        let envObj = { variables: {}, secrets: {} };
        if (tmpl.environmentId) {
          try {
            const envRec = EnvironmentModel.findById(tmpl.environmentId);
            if (envRec) {
              envObj = { id: envRec.id, name: envRec.name, variables: envRec.variables || {}, secrets: envRec.secrets || {} };
            }
          } catch (_) {}
        }
        const envYamlLines = Object.entries(envObj.variables || {}).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
        const envYaml = `# Environment Variables for task ${taskId}\n${envYamlLines.length > 0 ? envYamlLines.join('\n') : '# No environment variables'}\n`;
        fs.writeFileSync(path.join(taskWorkspace, 'environment.yml'), envYaml, 'utf8');

        // 4. Credential metadata (credential.json)
        let credObj = null;
        if (tmpl.credentialId) {
          try {
            const cred = CredentialModel.findById(tmpl.credentialId);
            if (cred) {
              credObj = { id: cred.id, name: cred.name, type: cred.type, username: cred.username };
            }
          } catch (_) {}
        }
        if (credObj) {
          fs.writeFileSync(path.join(taskWorkspace, 'credential.json'), JSON.stringify(credObj, null, 2), 'utf8');
        }

        // 5. env.json manifest
        fs.writeFileSync(path.join(taskWorkspace, 'env.json'), JSON.stringify({
          taskId,
          templateId: tmpl.id,
          templateName: tmpl.name,
          playbook,
          gitUrl: targetGitUrl,
          branch: targetBranch,
          limit: effectiveLimit,
          environment: envObj,
          extraVars: extraVarsObj,
          credential: credObj
        }, null, 2), 'utf8');

        // 6. Create execution.log file
        const logFilePath = path.join(taskWorkspace, 'execution.log');
        if (!fs.existsSync(logFilePath)) {
          fs.writeFileSync(logFilePath, '', 'utf8');
        }
      } catch (err) {
        console.error('[simulate] Error assembling task workspace files:', err);
      }

      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: '--- GIT PLAYBOOK SOURCE ---' });
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: `Workspace   : ${taskWorkspace}` });
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: `Repository  : ${repoName}` });
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: `Git URL     : ${targetGitUrl}` });
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: `Branch      : ${targetBranch}` });
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: `Playbook    : ${playbook}` });
      if (effectiveLimit && effectiveLimit !== 'all') {
        initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: `Limit       : ${effectiveLimit}` });
      }
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: '---------------------------' });
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: '' });

      resolve();
    });
  });

  if (inventoryContent) {
    initialLogLines.push({ ts: '', level: 'info', msg: 'TASK [Clone/Pull Inventory] ***' });
    initialLogLines.push({ ts: '', level: 'ok', msg: 'Successfully retrieved inventory.' });
    initialLogLines.push({ ts: '', level: 'info', msg: '--- INVENTORY CONTENT ---' });
    const invLines = inventoryContent.split('\n');
    invLines.forEach(line => {
      initialLogLines.push({ ts: '', level: 'info', msg: line });
    });
    initialLogLines.push({ ts: '', level: 'info', msg: '-------------------------' });
    initialLogLines.push({ ts: '', level: 'info', msg: '' });
  }

  if (effectiveLimit && effectiveLimit !== 'all') {
    initialLogLines.push({ ts: '', level: 'info', msg: `TASK [Target Host Limit Override: ${effectiveLimit}] ***` });
    initialLogLines.push({ ts: '', level: 'ok', msg: `Applied Ansible host limit '--limit ${effectiveLimit}'` });
    initialLogLines.push({ ts: '', level: 'info', msg: '' });
  }

  // Parse actual hosts from inventory filtered by limit override and actual tasks from playbook
  const targetHosts = parseInventoryHosts(inventoryContent, effectiveLimit);
  const targetPlaybookPath = path.join(taskWorkspace, playbook);
  const discoveredTasks = parsePlaybookTasks(targetPlaybookPath);

  let extraVarsObj = {};
  try { extraVarsObj = typeof tmpl.extraVars === 'string' ? JSON.parse(tmpl.extraVars || '{}') : (tmpl.extraVars || {}); } catch (_) {}
  const targetPcVal = extraVarsObj.target_pc || '127.0.0.1';

  const logLines = [
    ...initialLogLines,
    { ts: '', level: 'info', msg: `PLAY [${playbook}] ***` },
    { ts: '', level: 'info', msg: '' },
    { ts: '', level: 'info', msg: 'TASK [Gathering Facts] ***' }
  ];

  targetHosts.forEach(h => {
    logLines.push({ ts: '', level: 'ok', msg: `ok: [${h}]` });
  });
  logLines.push({ ts: '', level: 'info', msg: '' });

  discoveredTasks.forEach(taskName => {
    logLines.push({ ts: '', level: 'info', msg: `TASK [${taskName}] ***` });
    targetHosts.forEach(h => {
      if (taskName.toLowerCase().includes('display') && taskName.toLowerCase().includes('variable')) {
        logLines.push({ ts: '', level: 'ok', msg: `ok: [${h}] => {"msg": "Target PC to ping is: ${targetPcVal}"}` });
      } else if (taskName.toLowerCase().includes('ping')) {
        logLines.push({ ts: '', level: 'changed', msg: `changed: [${h}] => {"cmd": "ping ${targetPcVal}", "stdout": "Pinging ${targetPcVal} with 32 bytes of data:\\nReply from ${targetPcVal}: bytes=32 time<1ms TTL=128\\nPackets: Sent = 4, Received = 4, Lost = 0 (0% loss)"}` });
      } else {
        logLines.push({ ts: '', level: 'ok', msg: `ok: [${h}] => {"msg": "Task '${taskName}' executed successfully on ${h}"}` });
      }
    });
    logLines.push({ ts: '', level: 'info', msg: '' });
  });

  logLines.push({ ts: '', level: 'recap', msg: 'PLAY RECAP ***' });
  targetHosts.forEach(h => {
    logLines.push({ ts: '', level: 'recap', msg: `${h.padEnd(25)} : ok=${discoveredTasks.length + 1}  changed=1  unreachable=0  failed=0  skipped=0` });
  });

  let idx = 0;
  const startMs = Date.now();

  const interval = setInterval(() => {
    if (idx >= logLines.length) {
      clearInterval(interval);
      const durationSec = ((Date.now() - startMs) / 1000).toFixed(1);
      try {
        TaskModel.updateStatus(taskId, 'success', `${durationSec}s`, {
          ok: targetHosts.length * (discoveredTasks.length + 1),
          changed: targetHosts.length,
          unreachable: 0,
          failed: 0,
          skipped: 0
        });
        TemplateModel.incrementRuns(tmpl.id, 'success');
      } catch (e) {
        console.error('[simulate] Final update error:', e);
      }
      return;
    }

    const batch = logLines.slice(idx, idx + 3);
    batch.forEach((line) => {
      line.ts = new Date().toISOString();
    });
    idx += 3;

    try {
      TaskModel.appendLog(taskId, batch);
      
      // Append to disk execution.log
      const logFilePath = path.join(taskWorkspace, 'execution.log');
      const textToAppend = batch.map(b => `[${b.ts}] [${b.level || 'info'}] ${b.msg}`).join('\n') + '\n';
      fs.appendFileSync(logFilePath, textToAppend, 'utf8');
    } catch (e) {
      console.error('[simulate] Log append error:', e);
    }
  }, 400);
}

// Simulates a Terraform run with realistic log output and Git repo retrieval
async function simulateTerraformExecution(taskId, tmpl, limitOverride) {
  const mainTfFile = tmpl.playbook || 'main.tf';
  const effectiveLimit = limitOverride || tmpl.limit || 'all';

  const taskWorkspace = path.join(workspacesDir, taskId);
  try {
    if (!fs.existsSync(taskWorkspace)) {
      fs.mkdirSync(taskWorkspace, { recursive: true });
    }
  } catch (_) {}

  let rawGitUrl = tmpl.gitUrl || '';
  let repoName = tmpl.repositoryName || 'Terraform Git Repository';
  let branch = tmpl.branch || 'main';

  if (tmpl.repositoryId) {
    try {
      const repo = RepositoryModel.findById(tmpl.repositoryId);
      if (repo) {
        repoName = repo.name || repoName;
        rawGitUrl = repo.gitUrl || rawGitUrl;
        branch = repo.branch || branch;
      }
    } catch (_) {}
  }

  const { cleanGitUrl, subPath } = parseGitUrl(rawGitUrl);
  const targetGitUrl = cleanGitUrl || rawGitUrl;
  const targetBranch = branch;

  const initialLogLines = [];

  await new Promise((resolve) => {
    if (!targetGitUrl) {
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: '--- TERRAFORM WORKSPACE ---' });
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: `Workspace   : ${taskWorkspace}` });
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: `Main TF File: ${mainTfFile}` });
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: '---------------------------' });
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: '' });

      const targetTfPath = path.join(taskWorkspace, mainTfFile);
      if (!fs.existsSync(targetTfPath)) {
        const defaultTf = `# Terraform Configuration for ${tmpl.name}\nterraform {\n  required_version = ">= 1.0.0"\n}\n\nresource "null_resource" "provision_${(tmpl.name || 'resource').toLowerCase().replace(/[^a-z0-9]+/g, '_')}" {\n  provisioner "local-exec" {\n    command = "echo Terraform resource deployed"\n  }\n}\n`;
        fs.writeFileSync(targetTfPath, defaultTf, 'utf8');
      }
      return resolve();
    }

    initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: 'TASK [Retrieve Terraform Configuration from Git Repository] ***' });
    initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: `[Terminal] Task workspace: ${taskWorkspace}` });

    const gitCmd = `git clone --depth 1 -b ${JSON.stringify(targetBranch)} ${JSON.stringify(targetGitUrl)} ${JSON.stringify(taskWorkspace)}`;
    initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: `$ ${gitCmd}` });

    exec(gitCmd, { cwd: workspacesDir }, (error, stdout, stderr) => {
      if (error) {
        initialLogLines.push({ ts: new Date().toISOString(), level: 'error', msg: `Git Clone Warning/Fallback: ${error.message}` });
      } else {
        if (stdout) initialLogLines.push({ ts: new Date().toISOString(), level: 'ok', msg: stdout.trim() });
        initialLogLines.push({ ts: new Date().toISOString(), level: 'ok', msg: `ok: [localhost] => Git repository cloned successfully.` });
      }

      try {
        const templateDir = tmpl.folderPath ? path.resolve(__dirname, '../../', tmpl.folderPath) : null;
        const discoveredTf = findPlaybookInWorkspace(taskWorkspace, mainTfFile, subPath);
        if (discoveredTf && fs.existsSync(discoveredTf)) {
          const realTfContent = fs.readFileSync(discoveredTf, 'utf8');
          if (templateDir) {
            fs.writeFileSync(path.join(templateDir, mainTfFile), realTfContent, 'utf8');
            fs.writeFileSync(path.join(templateDir, 'main.tf'), realTfContent, 'utf8');
          }
        }
      } catch (err) {
        console.error('[simulate-tf] Error syncing discovered terraform file:', err);
      }

      try {
        const extraVarsObj = typeof tmpl.extraVars === 'string' ? JSON.parse(tmpl.extraVars || '{}') : (tmpl.extraVars || {});
        fs.writeFileSync(path.join(taskWorkspace, 'vars.json'), JSON.stringify(extraVarsObj, null, 2), 'utf8');
        fs.writeFileSync(path.join(taskWorkspace, 'terraform.tfvars.json'), JSON.stringify(extraVarsObj, null, 2), 'utf8');

        let envObj = { variables: {}, secrets: {} };
        if (tmpl.environmentId) {
          try {
            const envRec = EnvironmentModel.findById(tmpl.environmentId);
            if (envRec) envObj = { id: envRec.id, name: envRec.name, variables: envRec.variables || {}, secrets: envRec.secrets || {} };
          } catch (_) {}
        }

        fs.writeFileSync(path.join(taskWorkspace, 'env.json'), JSON.stringify({
          taskId,
          templateId: tmpl.id,
          templateName: tmpl.name,
          type: 'terraform',
          mainFile: mainTfFile,
          gitUrl: targetGitUrl,
          branch: targetBranch,
          limit: effectiveLimit,
          environment: envObj,
          extraVars: extraVarsObj
        }, null, 2), 'utf8');

        const logFilePath = path.join(taskWorkspace, 'execution.log');
        if (!fs.existsSync(logFilePath)) fs.writeFileSync(logFilePath, '', 'utf8');
      } catch (err) {
        console.error('[simulate-tf] Error assembling terraform workspace files:', err);
      }

      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: '--- TERRAFORM GIT CONFIGURATION ---' });
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: `Workspace   : ${taskWorkspace}` });
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: `Repository  : ${repoName}` });
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: `Git URL     : ${targetGitUrl}` });
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: `Branch      : ${targetBranch}` });
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: `Main TF File: ${mainTfFile}` });
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: '------------------------------------' });
      initialLogLines.push({ ts: new Date().toISOString(), level: 'info', msg: '' });

      resolve();
    });
  });

  const slugName = (tmpl.name || 'resource').toLowerCase().replace(/[^a-z0-9]+/g, '_');

  const logLines = [
    ...initialLogLines,
    { ts: '', level: 'info', msg: 'TASK [Terraform Init] ***' },
    { ts: '', level: 'info', msg: 'Initializing the backend...' },
    { ts: '', level: 'info', msg: 'Initializing provider plugins...' },
    { ts: '', level: 'info', msg: '- Finding latest version of hashicorp/local...' },
    { ts: '', level: 'info', msg: '- Installing hashicorp/local v2.5.2...' },
    { ts: '', level: 'ok', msg: 'Terraform has been successfully initialized!' },
    { ts: '', level: 'info', msg: '' },
    { ts: '', level: 'info', msg: 'TASK [Terraform Plan] ***' },
    { ts: '', level: 'info', msg: 'Terraform used the selected providers to generate the following execution plan:' },
    { ts: '', level: 'info', msg: `  # null_resource.${slugName}_cluster will be created` },
    { ts: '', level: 'info', msg: `  + resource "null_resource" "${slugName}_cluster" {` },
    { ts: '', level: 'info', msg: `      + id = (known after apply)` },
    { ts: '', level: 'info', msg: `    }` },
    { ts: '', level: 'ok', msg: 'Plan: 2 to add, 0 to change, 0 to destroy.' },
    { ts: '', level: 'info', msg: '' },
    { ts: '', level: 'info', msg: 'TASK [Terraform Apply] ***' },
    { ts: '', level: 'info', msg: `null_resource.${slugName}_cluster: Creating...` },
    { ts: '', level: 'ok', msg: `null_resource.${slugName}_cluster: Creation complete after 1s [id=res-${Date.now().toString().slice(-6)}]` },
    { ts: '', level: 'recap', msg: 'Apply complete! Resources: 2 added, 0 changed, 0 destroyed.' }
  ];

  let idx = 0;
  const startMs = Date.now();

  const interval = setInterval(() => {
    if (idx >= logLines.length) {
      clearInterval(interval);
      const durationSec = ((Date.now() - startMs) / 1000).toFixed(1);
      try {
        TaskModel.updateStatus(taskId, 'success', `${durationSec}s`, {
          ok: 2,
          changed: 2,
          unreachable: 0,
          failed: 0,
          skipped: 0
        });
        TemplateModel.incrementRuns(tmpl.id, 'success');
      } catch (e) {
        console.error('[simulate-tf] Final update error:', e);
      }
      return;
    }

    const batch = logLines.slice(idx, idx + 3);
    batch.forEach((line) => {
      line.ts = new Date().toISOString();
    });
    idx += 3;

    try {
      TaskModel.appendLog(taskId, batch);

      const logFilePath = path.join(taskWorkspace, 'execution.log');
      const textToAppend = batch.map(b => `[${b.ts}] [${b.level || 'info'}] ${b.msg}`).join('\n') + '\n';
      fs.appendFileSync(logFilePath, textToAppend, 'utf8');
    } catch (e) {
      console.error('[simulate-tf] Log append error:', e);
    }
  }, 800);
}

export default TemplateController;
