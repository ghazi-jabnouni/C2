import { DatabaseTypeModel } from '../models/database-type.model.js';

export const DatabaseTypeController = {
  list: (req, res) => {
    try {
      res.json(DatabaseTypeModel.findAll());
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to list database types' });
    }
  },
  create: (req, res) => {
    try {
      const { key, name } = req.body;
      if (!key || !name) return res.status(400).json({ error: 'Key and name are required' });
      res.status(201).json(DatabaseTypeModel.create(req.body));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create database type' });
    }
  },
  update: (req, res) => {
    try {
      const updated = DatabaseTypeModel.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Database type not found' });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update database type' });
    }
  },
  remove: (req, res) => {
    try {
      if (!DatabaseTypeModel.delete(req.params.id)) return res.status(404).json({ error: 'Database type not found' });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete database type' });
    }
  }
};

export default DatabaseTypeController;
