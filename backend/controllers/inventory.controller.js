import { InventoryModel } from '../models/inventory.model.js';

export const InventoryController = {
  list: (req, res) => {
    try {
      const inventories = InventoryModel.findAll();
      res.json(inventories);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to list inventories' });
    }
  },

  create: (req, res) => {
    try {
      const { name, type, inventoryContent, fileName, credentialId } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const created = InventoryModel.create({ name, type, inventoryContent, fileName, credentialId });
      res.status(201).json(created);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: `Failed to create inventory: ${err.message}` });
    }
  },

  update: (req, res) => {
    try {
      const id = req.params.id;
      const updated = InventoryModel.update(id, req.body);
      if (!updated) return res.status(404).json({ error: 'Inventory not found' });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update inventory' });
    }
  },

  remove: (req, res) => {
    try {
      const removed = InventoryModel.delete(req.params.id);
      if (!removed) return res.status(404).json({ error: 'Inventory not found' });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete inventory' });
    }
  }
};

export default InventoryController;
