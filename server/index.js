import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'db.json');
const INVENTORY_DIR = path.resolve(__dirname, '../backend/inventories');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function ensureInventoryDir() {
  try {
    fs.mkdirSync(INVENTORY_DIR, { recursive: true });
  } catch (err) {
    console.error('Error creating inventory directory:', err);
  }
}

function getInventoryFilePath(idOrFileName) {
  const fileName = String(idOrFileName || '').trim();
  const normalized = fileName.endsWith('.yml') || fileName.endsWith('.yaml') ? fileName : `${fileName}.yml`;
  return path.join(INVENTORY_DIR, normalized);
}

function getInventoryFileName(name, id) {
  const base = String(name || 'inventory').trim().toLowerCase();
  const slug = base
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'inventory';
  return `${slug}-${id}.yml`;
}

function loadInventoryFileContent(idOrFileName) {
  const filePath = getInventoryFilePath(idOrFileName);
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error('Error reading inventory file:', err);
    return null;
  }
}

function saveInventoryFileContent(fileName, content) {
  ensureInventoryDir();
  const finalName = String(fileName || '').trim();
  const filePath = getInventoryFilePath(finalName || 'inventory.yml');
  try {
    fs.writeFileSync(filePath, content || '[all]\nlocalhost ansible_connection=local\n', 'utf-8');
    return filePath;
  } catch (err) {
    console.error('Error writing inventory file:', err);
    return null;
  }
}

function deleteInventoryFile(fileNameOrId) {
  const fileName = String(fileNameOrId || '').trim();
  const filePath = getInventoryFilePath(fileName || 'inventory.yml');
  if (!fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    console.error('Error deleting inventory file:', err);
  }
}

app.use(cors());
app.use(express.json());

// Helper to read and write database
function readDb() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading db.json:', err);
    return {};
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing db.json:', err);
  }
}

// Active WS subscribers per taskId: Map<taskId, Set<WebSocket>>
const taskSubscribers = new Map();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const taskId = url.searchParams.get('taskId');

  if (taskId) {
    if (!taskSubscribers.has(taskId)) {
      taskSubscribers.set(taskId, new Set());
    }
    taskSubscribers.get(taskId).add(ws);

    // Send current logs immediately if available
    const db = readDb();
    const task = (db.tasks || []).find((t) => t.id === taskId);
    if (task) {
      ws.send(JSON.stringify({ type: 'INIT_TASK', task }));
    }
  }

  ws.on('close', () => {
    if (taskId && taskSubscribers.has(taskId)) {
      taskSubscribers.get(taskId).delete(ws);
    }
  });
});

function broadcastTaskUpdate(taskId, message) {
  if (taskSubscribers.has(taskId)) {
    const json = JSON.stringify(message);
    taskSubscribers.get(taskId).forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    });
  }
}

// ==========================================
// REST ENDPOINTS
// ==========================================

// Dashboard Stats
app.get('/api/dashboard/stats', (req, res) => {
  const db = readDb();
  const tasks = db.tasks || [];
  const templates = db.templates || [];
  const inventories = db.inventories || [];
  const pendingRequests = (db.pendingRequests || []).filter((r) => r.status === 'pending');
  const schedules = db.schedules || [];

  const successfulTasks = tasks.filter((t) => t.status === 'success').length;
  const failedTasks = tasks.filter((t) => t.status === 'failed').length;
  const runningTasks = tasks.filter((t) => t.status === 'running').length;

  res.json({
    totalTemplates: templates.length,
    totalInventories: inventories.length,
    totalTasksRun: tasks.length,
    runningTasks,
    successfulTasks,
    failedTasks,
    pendingApprovalsCount: pendingRequests.length,
    activeSchedulesCount: schedules.filter((s) => s.enabled).length,
    recentTasks: tasks.slice(-10).reverse()
  });
});

// Repositories
app.get('/api/repositories', (req, res) => {
  const db = readDb();
  res.json(db.repositories || []);
});

app.post('/api/repositories', (req, res) => {
  const db = readDb();
  const newRepo = {
    id: `repo-${Date.now()}`,
    name: req.body.name,
    gitUrl: req.body.gitUrl,
    branch: req.body.branch || 'main',
    credentialId: req.body.credentialId || null,
    lastSync: new Date().toISOString(),
    status: 'synced',
    playbooks: req.body.playbooks || [
      'playbooks/main.yml',
      'playbooks/deploy.yml',
      'playbooks/setup_system.yml'
    ]
  };
  db.repositories = db.repositories || [];
  db.repositories.push(newRepo);
  writeDb(db);
  res.status(201).json(newRepo);
});

app.post('/api/repositories/:id/sync', (req, res) => {
  const db = readDb();
  const repo = (db.repositories || []).find((r) => r.id === req.params.id);
  if (!repo) return res.status(404).json({ error: 'Repository not found' });

  repo.lastSync = new Date().toISOString();
  repo.status = 'synced';
  if (!repo.playbooks || repo.playbooks.length === 0) {
    repo.playbooks = [
      'playbooks/site.yml',
      'playbooks/web_cluster_deploy.yml',
      'playbooks/database_backup.yml',
      'playbooks/security_patching.yml',
      'playbooks/nginx_ssl_renew.yml'
    ];
  }
  writeDb(db);
  res.json({ message: 'Repository synced successfully', repo });
});

app.delete('/api/repositories/:id', (req, res) => {
  const db = readDb();
  db.repositories = (db.repositories || []).filter((r) => r.id !== req.params.id);
  writeDb(db);
  res.json({ success: true });
});

// Credentials
app.get('/api/credentials', (req, res) => {
  const db = readDb();
  res.json(db.credentials || []);
});

app.post('/api/credentials', (req, res) => {
  const db = readDb();
  const newCred = {
    id: `cred-${Date.now()}`,
    name: req.body.name,
    type: req.body.type || 'ssh_key',
    username: req.body.username || 'root',
    sshKey: req.body.sshKey || '',
    vaultPassword: req.body.vaultPassword ? '••••••••••••••••' : '',
    sudoPassword: req.body.sudoPassword ? '••••••••••••••••' : '',
    secretToken: req.body.secretToken ? '••••••••••••••••' : '',
    createdAt: new Date().toISOString()
  };
  db.credentials = db.credentials || [];
  db.credentials.push(newCred);
  writeDb(db);
  res.status(201).json(newCred);
});

app.delete('/api/credentials/:id', (req, res) => {
  const db = readDb();
  db.credentials = (db.credentials || []).filter((c) => c.id !== req.params.id);
  writeDb(db);
  res.json({ success: true });
});

// Inventories
app.get('/api/inventories', (req, res) => {
  const db = readDb();
  let changed = false;

  const inventories = (db.inventories || []).map((inv) => {
    // If this inventory has no file yet (e.g. seed data), create its file now
    if (inv.type === 'static' && !inv.fileName) {
      const fileName = getInventoryFileName(inv.name || 'inventory', inv.id);
      const content = inv.inventoryContent || '[all]\nlocalhost ansible_connection=local\n';
      const filePath = saveInventoryFileContent(fileName, content);
      inv.fileName = fileName;
      inv.filePath = filePath ? path.relative(process.cwd(), filePath) : null;
      changed = true;
    }

    const fileName = inv.fileName || getInventoryFileName(inv.name || 'inventory', inv.id);
    const fileContent = loadInventoryFileContent(fileName) || inv.inventoryContent || '[all]\nlocalhost ansible_connection=local\n';

    return {
      ...inv,
      inventoryContent: fileContent,
      fileName,
      filePath: inv.filePath || path.relative(process.cwd(), getInventoryFilePath(fileName))
    };
  });

  if (changed) {
    db.inventories = inventories.map(({ inventoryContent, ...rest }) => ({
      ...rest,
      inventoryContent
    }));
    writeDb(db);
  }

  res.json(inventories);
});

app.post('/api/inventories', (req, res) => {
  const db = readDb();
  // Use content exactly as provided (INI format: [group]\nhost ansible_host=ip)
  const content = req.body.inventoryContent || '[all]\nlocalhost ansible_connection=local\n';
  const id = `inv-${Date.now()}`;
  const type = req.body.type || 'static';
  // Count host lines: non-empty, non-group-header, non-comment lines
  const hostCount = content.split('\n').filter((l) => {
    const t = l.trim();
    return t && !t.startsWith('[') && !t.startsWith('#');
  }).length || 1;
  // Filename is a slug of the inventory name
  const fileName = getInventoryFileName(req.body.name || 'inventory', id);

  // Write the INI content to the file
  const savedPath = type === 'static' ? saveInventoryFileContent(fileName, content) : null;

  const newInv = {
    id,
    name: req.body.name,
    type,
    hostCount,
    inventoryContent: content,
    fileName: type === 'static' ? fileName : null,
    filePath: savedPath ? path.relative(process.cwd(), savedPath) : null,
    updatedAt: new Date().toISOString()
  };

  db.inventories = db.inventories || [];
  db.inventories.push(newInv);
  writeDb(db);
  res.status(201).json(newInv);
});

app.put('/api/inventories/:id', (req, res) => {
  const db = readDb();
  const index = (db.inventories || []).findIndex((i) => i.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Inventory not found' });

  const existing = db.inventories[index];
  const nextType = req.body.type || existing.type || 'static';
  const nextContent = req.body.inventoryContent !== undefined
    ? req.body.inventoryContent
    : (existing.inventoryContent || '[all]\nlocalhost ansible_connection=local\n');
  const nextName = req.body.name || existing.name || 'inventory';
  // Always use the same filename (don't regenerate on rename)
  const nextFileName = existing.fileName || getInventoryFileName(nextName, existing.id);

  const hostCount = nextContent.split('\n').filter((l) => {
    const t = l.trim();
    return t && !t.startsWith('[') && !t.startsWith('#');
  }).length || existing.hostCount || 1;

  let savedFilePath = existing.filePath || null;
  if (nextType === 'static') {
    const fp = saveInventoryFileContent(nextFileName, nextContent);
    if (fp) savedFilePath = path.relative(process.cwd(), fp);
  }

  db.inventories[index] = {
    ...existing,
    name: nextName,
    type: nextType,
    inventoryContent: nextContent,
    hostCount,
    fileName: nextType === 'static' ? nextFileName : null,
    filePath: nextType === 'static' ? savedFilePath : null,
    updatedAt: new Date().toISOString()
  };

  writeDb(db);
  res.json(db.inventories[index]);
});

app.delete('/api/inventories/:id', (req, res) => {
  const db = readDb();
  const inventory = (db.inventories || []).find((i) => i.id === req.params.id);
  if (inventory && inventory.type === 'static') {
    deleteInventoryFile(inventory.fileName || inventory.id);
  }
  db.inventories = (db.inventories || []).filter((i) => i.id !== req.params.id);
  writeDb(db);
  res.json({ success: true });
});

// Environments
app.get('/api/environments', (req, res) => {
  const db = readDb();
  res.json(db.environments || []);
});

app.post('/api/environments', (req, res) => {
  const db = readDb();
  const newEnv = {
    id: `env-${Date.now()}`,
    name: req.body.name,
    variables: req.body.variables || {},
    secrets: req.body.secrets || {},
    updatedAt: new Date().toISOString()
  };
  db.environments = db.environments || [];
  db.environments.push(newEnv);
  writeDb(db);
  res.status(201).json(newEnv);
});

app.put('/api/environments/:id', (req, res) => {
  const db = readDb();
  const index = (db.environments || []).findIndex((e) => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Environment not found' });

  db.environments[index] = {
    ...db.environments[index],
    name: req.body.name || db.environments[index].name,
    variables: req.body.variables || db.environments[index].variables,
    secrets: req.body.secrets || db.environments[index].secrets,
    updatedAt: new Date().toISOString()
  };
  writeDb(db);
  res.json(db.environments[index]);
});

app.delete('/api/environments/:id', (req, res) => {
  const db = readDb();
  db.environments = (db.environments || []).filter((e) => e.id !== req.params.id);
  writeDb(db);
  res.json({ success: true });
});

// Templates
app.get('/api/templates', (req, res) => {
  const db = readDb();
  res.json(db.templates || []);
});

app.get('/api/templates/:id', (req, res) => {
  const db = readDb();
  const template = (db.templates || []).find((t) => t.id === req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  res.json(template);
});

app.post('/api/templates', (req, res) => {
  const db = readDb();
  const autoPlaybookName = req.body.name
    ? req.body.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '.yml'
    : 'playbook.yml';
  const newTemplate = {
    id: `tmpl-${Date.now()}`,
    name: req.body.name,
    description: req.body.description || '',
    dbType: req.body.dbType || 'postgresql',
    repositoryId: req.body.repositoryId || null,
    playbook: req.body.playbook || autoPlaybookName,
    playbookContent: req.body.playbookContent || '',
    inventoryId: req.body.inventoryId,
    credentialId: req.body.credentialId || null,
    environmentId: req.body.environmentId || null,
    extraVars: req.body.extraVars || '{}',
    limit: req.body.limit || 'all',
    tags: req.body.tags || '',
    allowCliArgs: req.body.allowCliArgs ?? true,
    totalRuns: 0,
    lastRunStatus: 'never',
    lastRunAt: null
  };
  db.templates = db.templates || [];
  db.templates.push(newTemplate);
  writeDb(db);
  res.status(201).json(newTemplate);
});

app.put('/api/templates/:id', (req, res) => {
  const db = readDb();
  const index = (db.templates || []).findIndex((t) => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Template not found' });

  db.templates[index] = {
    ...db.templates[index],
    ...req.body,
    id: req.params.id
  };
  writeDb(db);
  res.json(db.templates[index]);
});

app.delete('/api/templates/:id', (req, res) => {
  const db = readDb();
  db.templates = (db.templates || []).filter((t) => t.id !== req.params.id);
  writeDb(db);
  res.json({ success: true });
});

// Tasks & Execution Engine
app.get('/api/tasks', (req, res) => {
  const db = readDb();
  const { templateId } = req.query;
  let tasks = db.tasks || [];
  if (templateId) {
    tasks = tasks.filter((t) => t.templateId === templateId);
  }
  res.json(tasks.slice().reverse());
});

app.get('/api/tasks/:id', (req, res) => {
  const db = readDb();
  const task = (db.tasks || []).find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// Launch Task Execution
app.post('/api/templates/:id/run', (req, res) => {
  const db = readDb();
  const template = (db.templates || []).find((t) => t.id === req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const inventory = (db.inventories || []).find((i) => i.id === template.inventoryId);
  const taskId = `task-${Date.now()}`;
  const now = new Date().toISOString();

  const newTask = {
    id: taskId,
    templateId: template.id,
    templateName: template.name,
    status: 'running',
    startedAt: now,
    finishedAt: null,
    duration: 'running...',
    triggeredBy: req.body.triggeredBy || 'admin@semaphore.io',
    inventoryName: inventory ? inventory.name : 'Default Inventory',
    playbook: template.playbook,
    extraVars: req.body.extraVars || template.extraVars,
    limit: req.body.limit || template.limit,
    hostsStats: { ok: 0, changed: 0, unreachable: 0, failed: 0, skipped: 0 },
    logs: [
      `[00:00:00] Initializing Ansible runner worker process...`,
      `[00:00:01] Injecting credentials & environment parameters...`,
      `[00:00:02] ansible-playbook -i inventories/${inventory ? inventory.name.toLowerCase().replace(/\s+/g, '_') : 'hosts'} ${template.playbook} --limit ${req.body.limit || template.limit || 'all'}`,
      `[00:00:02] `
    ]
  };

  db.tasks = db.tasks || [];
  db.tasks.push(newTask);

  // Update template last run
  template.totalRuns = (template.totalRuns || 0) + 1;
  template.lastRunStatus = 'running';
  template.lastRunAt = now;

  writeDb(db);
  res.status(201).json(newTask);

  // Start asynchronous realistic simulation
  simulateAnsibleExecution(taskId, template.name, template.playbook);
});

// Asynchronous Ansible Runner Simulation Engine
function simulateAnsibleExecution(taskId, templateName, playbook) {
  const steps = [
    { delay: 1200, line: `PLAY [${templateName}] *****************************************************` },
    { delay: 800, line: `TASK [Gathering Facts] ******************************************************************` },
    { delay: 1100, line: `ok: [web-prod-01.us-east.company.internal] => (ansible_distribution="Ubuntu 24.04", arch="x86_64")`, stat: 'ok' },
    { delay: 900, line: `ok: [web-prod-02.us-east.company.internal] => (ansible_distribution="Ubuntu 24.04", arch="x86_64")`, stat: 'ok' },
    { delay: 1000, line: `ok: [web-prod-03.eu-west.company.internal] => (ansible_distribution="Ubuntu 24.04", arch="x86_64")`, stat: 'ok' },
    { delay: 600, line: `` },
    { delay: 1200, line: `TASK [core : Validate configuration files & syntax] *********************************` },
    { delay: 1000, line: `ok: [web-prod-01.us-east.company.internal]`, stat: 'ok' },
    { delay: 800, line: `ok: [web-prod-02.us-east.company.internal]`, stat: 'ok' },
    { delay: 800, line: `ok: [web-prod-03.eu-west.company.internal]`, stat: 'ok' },
    { delay: 600, line: `` },
    { delay: 1400, line: `TASK [service : Synchronize package updates & dependencies] *************************` },
    { delay: 1500, line: `changed: [web-prod-01.us-east.company.internal] => (item=nginx, status=updated)`, stat: 'changed' },
    { delay: 1300, line: `changed: [web-prod-02.us-east.company.internal] => (item=nginx, status=updated)`, stat: 'changed' },
    { delay: 1400, line: `changed: [web-prod-03.eu-west.company.internal] => (item=nginx, status=updated)`, stat: 'changed' },
    { delay: 600, line: `` },
    { delay: 1300, line: `TASK [app : Deploy release bundle and configure environment] ***********************` },
    { delay: 1600, line: `changed: [web-prod-01.us-east.company.internal] => (release="v2.4.0", sha="8f12a4")`, stat: 'changed' },
    { delay: 1400, line: `changed: [web-prod-02.us-east.company.internal] => (release="v2.4.0", sha="8f12a4")`, stat: 'changed' },
    { delay: 1500, line: `changed: [web-prod-03.eu-west.company.internal] => (release="v2.4.0", sha="8f12a4")`, stat: 'changed' },
    { delay: 600, line: `` },
    { delay: 1100, line: `TASK [healthcheck : Verify microservice response & latency] *************************` },
    { delay: 1200, line: `ok: [web-prod-01.us-east.company.internal] => (HTTP 200, latency=14ms)`, stat: 'ok' },
    { delay: 1000, line: `ok: [web-prod-02.us-east.company.internal] => (HTTP 200, latency=17ms)`, stat: 'ok' },
    { delay: 1100, line: `ok: [web-prod-03.eu-west.company.internal] => (HTTP 200, latency=21ms)`, stat: 'ok' },
    { delay: 800, line: `` },
    { delay: 1000, line: `PLAY RECAP *****************************************************************************` },
    { delay: 600, line: `web-prod-01.us-east.company.internal : ok=6    changed=2    unreachable=0    failed=0    skipped=0` },
    { delay: 600, line: `web-prod-02.us-east.company.internal : ok=6    changed=2    unreachable=0    failed=0    skipped=0` },
    { delay: 600, line: `web-prod-03.eu-west.company.internal : ok=6    changed=2    unreachable=0    failed=0    skipped=0` },
    { delay: 800, line: `==========================================================================================` },
    { delay: 600, line: `PLAYBOOK EXECUTION COMPLETED SUCCESSFULLY IN 0m 28s` }
  ];

  let currentStep = 0;
  const startTime = Date.now();

  function runNext() {
    if (currentStep >= steps.length) {
      // Execution finished
      const db = readDb();
      const task = (db.tasks || []).find((t) => t.id === taskId);
      if (task) {
        task.status = 'success';
        task.finishedAt = new Date().toISOString();
        task.duration = `${Math.round((Date.now() - startTime) / 1000)}s`;
        task.hostsStats = { ok: 18, changed: 6, unreachable: 0, failed: 0, skipped: 0 };
        
        const template = (db.templates || []).find((tmpl) => tmpl.id === task.templateId);
        if (template) {
          template.lastRunStatus = 'success';
          template.lastRunAt = task.finishedAt;
        }
        writeDb(db);
        broadcastTaskUpdate(taskId, { type: 'TASK_FINISHED', task });
      }
      return;
    }

    const step = steps[currentStep];
    const timestamp = new Date().toLocaleTimeString();
    const formattedLine = step.line.startsWith('PLAY') || step.line.startsWith('TASK') || step.line.startsWith('===') || !step.line
      ? step.line
      : `[${timestamp}] ${step.line}`;

    const db = readDb();
    const task = (db.tasks || []).find((t) => t.id === taskId);
    if (task) {
      task.logs.push(formattedLine);
      if (step.stat === 'ok') task.hostsStats.ok = (task.hostsStats.ok || 0) + 1;
      if (step.stat === 'changed') task.hostsStats.changed = (task.hostsStats.changed || 0) + 1;
      writeDb(db);
      broadcastTaskUpdate(taskId, {
        type: 'LOG_APPEND',
        line: formattedLine,
        hostsStats: task.hostsStats
      });
    }

    currentStep++;
    setTimeout(runNext, step.delay);
  }

  setTimeout(runNext, 500);
}

// Stop/Cancel Task
app.post('/api/tasks/:id/cancel', (req, res) => {
  const db = readDb();
  const task = (db.tasks || []).find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  task.status = 'failed';
  task.finishedAt = new Date().toISOString();
  task.logs.push(`[${new Date().toLocaleTimeString()}] !!! EXECUTION ABORTED BY USER OPERATOR !!!`);
  writeDb(db);
  broadcastTaskUpdate(task.id, { type: 'TASK_CANCELLED', task });
  res.json({ message: 'Task cancelled', task });
});

// Schedules
app.get('/api/schedules', (req, res) => {
  const db = readDb();
  res.json(db.schedules || []);
});

app.post('/api/schedules', (req, res) => {
  const db = readDb();
  const template = (db.templates || []).find((t) => t.id === req.body.templateId);
  const newSchedule = {
    id: `sched-${Date.now()}`,
    templateId: req.body.templateId,
    templateName: template ? template.name : 'Custom Template',
    cron: req.body.cron || '0 0 * * *',
    cronHuman: req.body.cronHuman || 'Every day at 00:00 UTC',
    enabled: req.body.enabled ?? true,
    lastRun: null,
    nextRun: new Date(Date.now() + 86400000).toISOString()
  };
  db.schedules = db.schedules || [];
  db.schedules.push(newSchedule);
  writeDb(db);
  res.status(201).json(newSchedule);
});

app.put('/api/schedules/:id', (req, res) => {
  const db = readDb();
  const index = (db.schedules || []).findIndex((s) => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Schedule not found' });

  db.schedules[index] = { ...db.schedules[index], ...req.body };
  writeDb(db);
  res.json(db.schedules[index]);
});

app.delete('/api/schedules/:id', (req, res) => {
  const db = readDb();
  db.schedules = (db.schedules || []).filter((s) => s.id !== req.params.id);
  writeDb(db);
  res.json({ success: true });
});

// Pending Client Requests (Approval Queue)
app.get('/api/pending-requests', (req, res) => {
  const db = readDb();
  res.json(db.pendingRequests || []);
});

// External Client Dispatch Endpoint (Called by external CI/CD, developers, webhooks)
app.post('/api/v1/client/dispatch', (req, res) => {
  const authHeader = req.headers.authorization;
  const db = readDb();

  const template = (db.templates || []).find((t) => t.id === req.body.templateId);
  if (!template) {
    return res.status(400).json({ error: 'Invalid templateId' });
  }

  const newRequest = {
    id: `req-${Date.now()}`,
    clientName: req.body.clientName || 'External API Client',
    clientIp: req.ip || '127.0.0.1',
    templateId: template.id,
    templateName: template.name,
    submittedAt: new Date().toISOString(),
    status: 'pending',
    requestedBy: req.body.requestedBy || 'api-service-account',
    extraVars: req.body.extraVars || {},
    reason: req.body.reason || 'External programmatic execution request'
  };

  db.pendingRequests = db.pendingRequests || [];
  db.pendingRequests.unshift(newRequest);
  writeDb(db);

  res.status(202).json({
    message: 'Task execution request received and queued for operator approval',
    requestId: newRequest.id,
    status: 'pending_approval'
  });
});

app.post('/api/pending-requests/:id/approve', (req, res) => {
  const db = readDb();
  const request = (db.pendingRequests || []).find((r) => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  request.status = 'approved';
  request.reviewedBy = req.body.reviewer || 'admin@semaphore.io';
  request.reviewedAt = new Date().toISOString();

  // Create and launch the task
  const template = (db.templates || []).find((t) => t.id === request.templateId);
  if (template) {
    const inventory = (db.inventories || []).find((i) => i.id === template.inventoryId);
    const taskId = `task-${Date.now()}`;
    const newTask = {
      id: taskId,
      templateId: template.id,
      templateName: template.name,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      duration: 'running...',
      triggeredBy: `Approved (${request.requestedBy})`,
      inventoryName: inventory ? inventory.name : 'Default',
      playbook: template.playbook,
      extraVars: JSON.stringify(request.extraVars || {}),
      hostsStats: { ok: 0, changed: 0, unreachable: 0, failed: 0, skipped: 0 },
      logs: [
        `[00:00:00] Approving pending external request: ${request.id}`,
        `[00:00:01] Requested by: ${request.requestedBy} (${request.clientName})`,
        `[00:00:02] Reason: ${request.reason}`,
        `[00:00:03] Starting Ansible runner worker...`
      ]
    };
    db.tasks = db.tasks || [];
    db.tasks.push(newTask);
    writeDb(db);
    simulateAnsibleExecution(taskId, template.name, template.playbook);
    return res.json({ message: 'Request approved and task launched', task: newTask });
  }

  writeDb(db);
  res.json({ message: 'Request approved' });
});

app.post('/api/pending-requests/:id/reject', (req, res) => {
  const db = readDb();
  const request = (db.pendingRequests || []).find((r) => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  request.status = 'rejected';
  request.reviewedBy = req.body.reviewer || 'admin@semaphore.io';
  request.reviewedAt = new Date().toISOString();
  request.rejectionReason = req.body.rejectionReason || 'Declined by administrator';
  writeDb(db);
  res.json({ message: 'Request rejected', request });
});

// API Tokens
app.get('/api/tokens', (req, res) => {
  const db = readDb();
  res.json(db.apiTokens || []);
});

app.post('/api/tokens', (req, res) => {
  const db = readDb();
  const hex = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
  const prefix = `sem_live_${hex.substring(0, 4)}`;
  const fullToken = `${prefix}${hex}`;

  const newToken = {
    id: `tok-${Date.now()}`,
    name: req.body.name,
    tokenPrefix: prefix,
    tokenFull: fullToken,
    scopes: req.body.scopes || ['tasks:create', 'tasks:read'],
    lastUsedAt: null,
    createdAt: new Date().toISOString()
  };

  db.apiTokens = db.apiTokens || [];
  db.apiTokens.push(newToken);
  writeDb(db);
  res.status(201).json(newToken);
});

app.delete('/api/tokens/:id', (req, res) => {
  const db = readDb();
  db.apiTokens = (db.apiTokens || []).filter((t) => t.id !== req.params.id);
  writeDb(db);
  res.json({ success: true });
});

// Workflows (Visual DAG Pipelines)
app.get('/api/workflows', (req, res) => {
  const db = readDb();
  res.json(db.workflows || []);
});

app.post('/api/workflows', (req, res) => {
  const db = readDb();
  const newWf = {
    id: `wf-${Date.now()}`,
    name: req.body.name,
    description: req.body.description || '',
    nodes: req.body.nodes || [],
    edges: req.body.edges || [],
    totalRuns: 0,
    lastRunStatus: 'never',
    lastRunAt: null
  };
  db.workflows = db.workflows || [];
  db.workflows.push(newWf);
  writeDb(db);
  res.status(201).json(newWf);
});

app.put('/api/workflows/:id', (req, res) => {
  const db = readDb();
  const index = (db.workflows || []).findIndex((w) => w.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Workflow not found' });

  db.workflows[index] = {
    ...db.workflows[index],
    name: req.body.name || db.workflows[index].name,
    description: req.body.description || db.workflows[index].description,
    nodes: req.body.nodes || db.workflows[index].nodes,
    edges: req.body.edges || db.workflows[index].edges
  };
  writeDb(db);
  res.json(db.workflows[index]);
});

app.delete('/api/workflows/:id', (req, res) => {
  const db = readDb();
  db.workflows = (db.workflows || []).filter((w) => w.id !== req.params.id);
  writeDb(db);
  res.json({ success: true });
});

// Users
app.get('/api/users', (req, res) => {
  const db = readDb();
  res.json(db.users || []);
});

app.post('/api/users', (req, res) => {
  const db = readDb();
  const newUser = {
    id: `usr-${Date.now()}`,
    name: req.body.name,
    email: req.body.email,
    role: req.body.role || 'Operator',
    status: 'active',
    lastLogin: 'Never'
  };
  db.users = db.users || [];
  db.users.push(newUser);
  writeDb(db);
  res.status(201).json(newUser);
});

app.delete('/api/users/:id', (req, res) => {
  const db = readDb();
  db.users = (db.users || []).filter((u) => u.id !== req.params.id);
  writeDb(db);
  res.json({ success: true });
});

const PORT = process.env.PORT || 5055;
server.listen(PORT, () => {
  console.log(`Automation Platform Backend Engine running on http://localhost:${PORT}`);
  console.log(`WebSocket Server listening on ws://localhost:${PORT}/ws`);
});
