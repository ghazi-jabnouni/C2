import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config/server.config.js';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { TaskModel } from '../models/task.model.js';

const execAsync = promisify(exec);

function directorySize(directory) {
  if (!fs.existsSync(directory)) return { bytes: 0, files: 0 };
  let bytes = 0;
  let files = 0;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) walk(fullPath);
        else { bytes += fs.statSync(fullPath).size; files += 1; }
      } catch (_) {}
    }
  };
  try { walk(directory); } catch (_) {}
  return { bytes, files };
}

function diskUsage() {
  return new Promise((resolve) => {
    const command = process.platform === 'win32'
      ? 'powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk -Filter \'DeviceID=\\\"$((Get-Location).Path.Substring(0,1)):\\\"\' | Select-Object -First 1 Size,FreeSpace | ConvertTo-Json -Compress"'
      : 'df -Pk . | tail -1';
    execAsync(command, { timeout: 5000 }).then(({ stdout }) => {
      if (process.platform === 'win32') {
        const parsed = JSON.parse(stdout);
        const totalBytes = Number(parsed.Size || 0);
        const freeBytes = Number(parsed.FreeSpace || 0);
        return resolve({ totalBytes, freeBytes, usedBytes: Math.max(0, totalBytes - freeBytes) });
      }
      const parts = stdout.trim().split(/\s+/);
      const totalBytes = Number(parts[1] || 0) * 1024;
      const usedBytes = Number(parts[2] || 0) * 1024;
      resolve({ totalBytes, freeBytes: Math.max(0, totalBytes - usedBytes), usedBytes });
    }).catch(() => resolve({ totalBytes: 0, freeBytes: 0, usedBytes: 0 }));
  });
}

function cpuPercent() {
  const start = os.cpus();
  const startIdle = start.reduce((sum, cpu) => sum + cpu.times.idle, 0);
  const startTotal = start.reduce((sum, cpu) => sum + Object.values(cpu.times).reduce((a, value) => a + value, 0), 0);
  return new Promise((resolve) => setTimeout(() => {
    const end = os.cpus();
    const idle = end.reduce((sum, cpu) => sum + cpu.times.idle, 0) - startIdle;
    const total = end.reduce((sum, cpu) => sum + Object.values(cpu.times).reduce((a, value) => a + value, 0), 0) - startTotal;
    resolve(total ? Math.round((1 - idle / total) * 100) : 0);
  }, 100));
}

/**
 * Run a shell command and return stdout, or an error string.
 */
async function run(cmd) {
  try {
    const { stdout } = await execAsync(cmd, { timeout: 10000 });
    return stdout.trim();
  } catch (err) {
    return null;
  }
}

export const SystemInfoController = {

  performance: async (req, res) => {
    try {
      const [cpu, disk] = await Promise.all([cpuPercent(), diskUsage()]);
      const root = path.resolve(process.cwd());
      const templates = directorySize(path.join(root, 'backend', 'templates'));
      const workspaces = directorySize(path.join(root, 'backend', 'workspaces'));
      const memoryTotal = os.totalmem();
      const memoryFree = os.freemem();
      const runningTasks = TaskModel.findAll().filter((task) => task.status === 'running');
      res.json({
        collectedAt: new Date().toISOString(),
        cpuPercent: cpu,
        memory: { totalBytes: memoryTotal, freeBytes: memoryFree, usedBytes: memoryTotal - memoryFree, percent: Math.round(((memoryTotal - memoryFree) / memoryTotal) * 100) },
        process: { rssBytes: process.memoryUsage().rss, heapUsedBytes: process.memoryUsage().heapUsed, uptimeSeconds: Math.floor(process.uptime()) },
        disk,
        runningTasks,
        storage: { templates, workspaces }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  /**
   * GET /api/system-info
   * Returns Ansible version, Terraform version, installed Ansible collections,
   * and basic platform/runtime info.
   */
  get: async (req, res) => {
    try {
      const ansibleBin   = config.ansible.bin    || 'ansible';
      const playbookBin  = config.ansible.bin    || 'ansible-playbook';
      const terraformBin = config.terraform.bin  || 'terraform';

      // Run all version probes in parallel
      const [
        ansibleRaw,
        playbookRaw,
        terraformRaw,
        pythonRaw,
        collectionsRaw,
        nodeRaw,
        hostnameRaw,
        kernelRaw,
      ] = await Promise.all([
        run(`ansible --version`),
        run(`${playbookBin} --version`),
        run(`${terraformBin} version`),
        run('python3 --version'),
        run('ansible-galaxy collection list'),
        run('node --version'),
        run('hostname'),
        run('uname -r'),
      ]);

      // ── Parse Ansible version ─────────────────────────────
      const ansibleVersion = ansibleRaw
        ? (ansibleRaw.match(/ansible\s+\[?core\s+([\d.]+)/i)?.[1]
            || ansibleRaw.match(/ansible ([\d.]+)/i)?.[1]
            || ansibleRaw.split('\n')[0])
        : 'Not found';

      const ansiblePythonVersion = ansibleRaw
        ? (ansibleRaw.match(/python version\s*=\s*([\d.]+)/i)?.[1] || null)
        : null;

      const ansibleConfigFile = ansibleRaw
        ? (ansibleRaw.match(/config file\s*=\s*(.+)/i)?.[1]?.trim() || null)
        : null;

      // ── Parse Terraform version ───────────────────────────
      const terraformVersion = terraformRaw
        ? (terraformRaw.match(/Terraform v([\d.]+)/)?.[1] || terraformRaw.split('\n')[0])
        : 'Not found';

      // ── Parse Python version ──────────────────────────────
      const pythonVersion = pythonRaw
        ? (pythonRaw.match(/([\d.]+)/)?.[1] || pythonRaw)
        : 'Not found';

      // ── Parse ansible-galaxy collection list ──────────────
      const collections = [];
      if (collectionsRaw) {
        const lines = collectionsRaw.split('\n');
        let currentNamespace = null;

        for (const line of lines) {
          // Collection path header e.g.  # /root/.ansible/collections/...
          if (line.startsWith('#')) continue;

          // Namespace header e.g.  community
          const namespaceMatch = line.match(/^([a-z_]+)\s*$/);
          if (namespaceMatch) {
            currentNamespace = namespaceMatch[1];
            continue;
          }

          // Collection row e.g.  "  postgresql                 3.4.0"
          const colMatch = line.match(/^\s+([a-z_]+)\s+([\d.]+)\s*$/);
          if (colMatch && currentNamespace) {
            collections.push({
              name: `${currentNamespace}.${colMatch[1]}`,
              version: colMatch[2],
            });
          }
        }
      }

      // ── Platform info ────────────────────────────────────
      const platform = {
        nodeVersion:     nodeRaw || process.version,
        platform:        process.platform,
        arch:            process.arch,
        hostname:        hostnameRaw || 'unknown',
        kernel:          kernelRaw   || 'unknown',
        pythonVersion,
        uptime:          Math.floor(process.uptime()),
        memoryUsageMb:   Math.round(process.memoryUsage().rss / 1024 / 1024),
      };

      res.json({
        ansible: {
          version:       ansibleVersion,
          pythonVersion: ansiblePythonVersion,
          configFile:    ansibleConfigFile,
          available:     !!ansibleRaw,
          rawFirstLine:  ansibleRaw ? ansibleRaw.split('\n')[0] : null,
        },
        terraform: {
          version:   terraformVersion,
          available: !!terraformRaw,
        },
        collections,
        platform,
      });
    } catch (err) {
      console.error('SystemInfo error:', err);
      res.status(500).json({ error: err.message });
    }
  },
};
