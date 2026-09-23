import { ScheduleModel } from '../models/schedule.model.js';

export const ScheduleController = {
  list: (req, res) => {
    try {
      res.json(ScheduleModel.findAll());
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to list schedules' });
    }
  },

  create: (req, res) => {
    try {
      const { templateId, cron } = req.body;
      if (!templateId || !cron) return res.status(400).json({ error: 'templateId and cron are required' });
      const created = ScheduleModel.create(req.body);
      res.status(201).json(created);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create schedule' });
    }
  },

  update: (req, res) => {
    try {
      const existing = ScheduleModel.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Schedule not found' });
      const updated = ScheduleModel.update(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update schedule' });
    }
  },

  remove: (req, res) => {
    try {
      const success = ScheduleModel.delete(req.params.id);
      if (!success) return res.status(404).json({ error: 'Schedule not found' });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete schedule' });
    }
  }
};

export default ScheduleController;
