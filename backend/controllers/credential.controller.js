import { CredentialModel } from '../models/credential.model.js';

export const CredentialController = {
  list: (req, res) => {
    try {
      const rows = CredentialModel.findAll();
      res.json(rows);
    } catch (err) {
      console.error('[cred:list] error', err);
      res.status(500).json({ error: 'Failed to list credentials' });
    }
  },

  create: (req, res) => {
    try {
      const data = req.body || {};
      console.log('[cred:create] Incoming payload:', JSON.stringify(data));
      console.log('[cred:create] Headers:', {
        authorization: req.headers.authorization,
        host: req.headers.host
      });
      const created = CredentialModel.create(data);
      res.json(created);
    } catch (err) {
      console.error('[cred:create] error', err);
      res.status(500).json({ error: 'Failed to create credential' });
    }
  },

  update: (req, res) => {
    try {
      const id = req.params.id;
      const updated = CredentialModel.update(id, req.body || {});
      if (!updated) {
        return res.status(404).json({ error: 'Credential not found' });
      }
      res.json(updated);
    } catch (err) {
      console.error('[cred:update] error', err);
      res.status(500).json({ error: 'Failed to update credential' });
    }
  },

  remove: (req, res) => {
    try {
      const id = req.params.id;
      const ok = CredentialModel.delete(id);
      res.json({ success: ok });
    } catch (err) {
      console.error('[cred:delete] error', err);
      res.status(500).json({ error: 'Failed to delete credential' });
    }
  }
};

export default CredentialController;
