import { RuntimeSettingsModel } from '../models/runtime-settings.model.js';
import { TaskModel } from '../models/task.model.js';

const DAY_MS = 24 * 60 * 60 * 1000;
let cleanupTimer;

export const RuntimeSettingsService = {
  pruneExpiredTaskLogs() {
    const { logRetentionDays } = RuntimeSettingsModel.get();
    if (logRetentionDays === 0) return 0;
    const cutoff = new Date(Date.now() - logRetentionDays * DAY_MS).toISOString();
    const deleted = TaskModel.deleteFinishedBefore(cutoff);
    if (deleted > 0) console.log(`[retention] Deleted ${deleted} completed task log(s) older than ${logRetentionDays} day(s)`);
    return deleted;
  },

  start() {
    if (cleanupTimer) return;
    this.pruneExpiredTaskLogs();
    cleanupTimer = setInterval(() => {
      try {
        this.pruneExpiredTaskLogs();
      } catch (error) {
        console.error('[retention] Cleanup failed:', error);
      }
    }, DAY_MS);
    cleanupTimer.unref?.();
  },

  stop() {
    if (cleanupTimer) clearInterval(cleanupTimer);
    cleanupTimer = undefined;
  }
};

export default RuntimeSettingsService;