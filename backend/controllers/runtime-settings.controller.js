import { RuntimeSettingsModel } from '../models/runtime-settings.model.js';
import { RuntimeSettingsService } from '../services/runtime-settings.service.js';

function isAdmin(req, res) {
  if (req.user?.role === 'Admin') return true;
  res.status(403).json({ error: 'Administrator access is required to manage runtime settings.' });
  return false;
}

export const RuntimeSettingsController = {
  get: (req, res) => {
    if (!isAdmin(req, res)) return;
    res.json(RuntimeSettingsModel.get());
  },

  save: (req, res) => {
    if (!isAdmin(req, res)) return;
    const maxConcurrentTasks = Number(req.body?.maxConcurrentTasks);
    const logRetentionDays = Number(req.body?.logRetentionDays);
    if (!Number.isInteger(maxConcurrentTasks) || maxConcurrentTasks < 1 || maxConcurrentTasks > 100) {
      return res.status(400).json({ error: 'Maximum concurrent tasks must be an integer from 1 to 100.' });
    }
    if (!Number.isInteger(logRetentionDays) || logRetentionDays < 0 || logRetentionDays > 3650) {
      return res.status(400).json({ error: 'Log retention must be 0 (keep indefinitely) or an integer up to 3650 days.' });
    }
    try {
      const settings = RuntimeSettingsModel.save({ maxConcurrentTasks, logRetentionDays });
      const deletedLogs = RuntimeSettingsService.pruneExpiredTaskLogs();
      res.json({ ...settings, deletedLogs });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }
};

export default RuntimeSettingsController;