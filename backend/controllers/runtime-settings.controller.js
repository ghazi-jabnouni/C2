import { RuntimeSettingsModel } from '../models/runtime-settings.model.js';
import { RuntimeSettingsService } from '../services/runtime-settings.service.js';

function isAdmin(req, res) {
  if (req.user?.role === 'Admin') return true;
  res.status(403).json({ error: 'Administrator access is required to manage runtime settings.' });
  return false;
}

export const RuntimeSettingsController = {
  get: (req, res) => {
    res.json(RuntimeSettingsModel.get());
  },

  save: (req, res) => {
    if (!isAdmin(req, res)) return;
    const maxConcurrentTasks = Number(req.body?.maxConcurrentTasks);
    const logRetentionDays = Number(req.body?.logRetentionDays);
    const serviceNames = Array.isArray(req.body?.serviceNames)
      ? [...new Set(req.body.serviceNames.map((name) => String(name).trim()).filter(Boolean))]
      : RuntimeSettingsModel.get().serviceNames;
    if (!Number.isInteger(maxConcurrentTasks) || maxConcurrentTasks < 1 || maxConcurrentTasks > 100) {
      return res.status(400).json({ error: 'Maximum concurrent tasks must be an integer from 1 to 100.' });
    }
    if (!Number.isInteger(logRetentionDays) || logRetentionDays < 0 || logRetentionDays > 3650) {
      return res.status(400).json({ error: 'Log retention must be 0 (keep indefinitely) or an integer up to 3650 days.' });
    }
    if (serviceNames.length > 100 || serviceNames.some((name) => name.length > 100)) {
      return res.status(400).json({ error: 'Enter no more than 100 service names, each up to 100 characters.' });
    }
    try {
      const settings = RuntimeSettingsModel.save({ maxConcurrentTasks, logRetentionDays, serviceNames });
      const deletedLogs = RuntimeSettingsService.pruneExpiredTaskLogs();
      res.json({ ...settings, deletedLogs });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }
};

export default RuntimeSettingsController;