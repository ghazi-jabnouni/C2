import db from '../config/db.js';

export const DashboardController = {
  getStats: (req, res) => {
    try {
      const templateCount = db.prepare('SELECT COUNT(*) AS count FROM templates').get().count;
      const taskCount = db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count;
      const runningTasks = db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE status = 'running'").get().count;
      const successTasks = db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE status = 'success'").get().count;
      const failedTasks = db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE status = 'failed'").get().count;
      const scheduleCount = db.prepare('SELECT COUNT(*) AS count FROM schedules').get().count;
      const pendingCount = db.prepare("SELECT COUNT(*) AS count FROM pending_requests WHERE status = 'pending'").get().count;
      const inventoryCount = db.prepare('SELECT COUNT(*) AS count FROM inventories').get().count;
      const credentialCount = db.prepare('SELECT COUNT(*) AS count FROM credentials').get().count;
      const repoCount = db.prepare('SELECT COUNT(*) AS count FROM repositories').get().count;

      // Recent tasks (last 10)
      const recentTasks = db.prepare('SELECT id, templateName, status, startedAt, duration FROM tasks ORDER BY rowid DESC LIMIT 10').all();

      res.json({
        templates: templateCount,
        tasks: { total: taskCount, running: runningTasks, success: successTasks, failed: failedTasks },
        schedules: scheduleCount,
        pendingRequests: pendingCount,
        inventories: inventoryCount,
        credentials: credentialCount,
        repositories: repoCount,
        recentTasks
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to get dashboard stats' });
    }
  }
};

export default DashboardController;
