import { UserModel } from '../models/user.model.js';

export const UserController = {
  getUsers: (req, res) => {
    try {
      const users = UserModel.findAll();
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  getUserById: (req, res) => {
    try {
      const user = UserModel.findById(req.params.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  createUser: (req, res) => {
    try {
      const { name, email, role, status } = req.body;
      if (!name || !email) {
        return res.status(400).json({ error: 'Name and Email are required' });
      }

      const newUser = UserModel.create({ name, email, role, status });
      res.status(201).json(newUser);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  updateUser: (req, res) => {
    try {
      const existing = UserModel.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'User not found' });

      const updatedUser = UserModel.update(req.params.id, req.body);
      res.json(updatedUser);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  deleteUser: (req, res) => {
    try {
      const success = UserModel.delete(req.params.id);
      if (!success) return res.status(404).json({ error: 'User not found' });
      res.json({ success: true, message: 'User deleted successfully' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};
