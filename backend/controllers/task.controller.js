import { TaskModel } from '../models/task.model.js';

export const TaskController = {
  list: (req, res) => {
    try {
      const templateId = req.query.templateId || null;
      res.json(TaskModel.findAll(templateId));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to list tasks' });
    }
  },

  getById: (req, res) => {
    try {
      const task = TaskModel.findById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to get task' });
    }
  },

  cancel: (req, res) => {
    try {
      const task = TaskModel.cancel(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to cancel task' });
    }
  },

  remove: (req, res) => {
    try {
      const success = TaskModel.delete(req.params.id);
      if (!success) return res.status(404).json({ error: 'Task not found' });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete task' });
    }
  },

  clearHistory: (req, res) => {
    try {
      const templateId = req.query.templateId || req.body?.templateId || null;
      TaskModel.clearHistory(templateId);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to clear task history' });
    }
  }
};

export default TaskController;
