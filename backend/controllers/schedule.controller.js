import { ScheduleModel } from '../models/schedule.model.js';
import { TemplateModel } from '../models/template.model.js';
import { ScheduleRunner } from '../services/schedule-runner.js';

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
      const template = TemplateModel.findById(templateId);
      if (!template) return res.status(404).json({ error: 'Template not found' });
      if (!ScheduleRunner.validate(cron)) return res.status(400).json({ error: 'Invalid cron expression' });
      const created = ScheduleModel.create({ ...req.body, templateName: req.body.templateName || template.name });
      try {
        ScheduleRunner.sync(created);
      } catch (err) {
        ScheduleModel.delete(created.id);
        throw err;
      }
      res.status(201).json(ScheduleModel.findById(created.id));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create schedule' });
    }
  },

  update: (req, res) => {
    try {
      const existing = ScheduleModel.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Schedule not found' });
      if (req.body.cron !== undefined && !ScheduleRunner.validate(req.body.cron)) {
        return res.status(400).json({ error: 'Invalid cron expression' });
      }
      if (req.body.templateId !== undefined && !TemplateModel.findById(req.body.templateId)) {
        return res.status(404).json({ error: 'Template not found' });
      }
      const updated = ScheduleModel.update(req.params.id, req.body);
      ScheduleRunner.sync(updated);
      res.json(ScheduleModel.findById(req.params.id));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update schedule' });
    }
  },

  remove: (req, res) => {
    try {
      ScheduleRunner.remove(req.params.id, false);
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
