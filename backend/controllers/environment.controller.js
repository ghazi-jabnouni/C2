import { EnvironmentModel } from '../models/environment.model.js';

export const EnvironmentController = {
  list: (req, res) => {
    try {
      const items = EnvironmentModel.findAll();
      res.json(items);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to list environments' });
    }
  },

  create: (req, res) => {
    try {
      const { name, variables, secrets } = req.body;
      console.log('[env:create] Incoming payload:', { name, variables, secrets });
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const created = EnvironmentModel.create({ name, variables, secrets });
      console.log('[env:create] Created:', created && created.id ? created.id : created);
      res.status(201).json(created);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create environment' });
    }
  },

  update: (req, res) => {
    try {
      const id = req.params.id;
      const { name, variables, secrets } = req.body;
      const updated = EnvironmentModel.update(id, { name, variables, secrets });
      if (!updated) return res.status(404).json({ error: 'Environment not found' });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update environment' });
    }
  },

  remove: (req, res) => {
    try {
      const id = req.params.id;
      EnvironmentModel.delete(id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete environment' });
    }
  }
};

export default EnvironmentController;
