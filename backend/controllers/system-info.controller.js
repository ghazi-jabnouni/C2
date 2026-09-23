import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config/server.config.js';

const execAsync = promisify(exec);

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
