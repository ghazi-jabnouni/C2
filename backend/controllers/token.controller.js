import { TokenModel } from '../models/token.model.js';

export const TokenController = {
  list: (req, res) => {
    try {
      const tokens = TokenModel.findAll().map((t) => {
        let scopes = [];
        try { scopes = JSON.parse(t.scopes || '[]'); } catch (e) { scopes = []; }
        return { id: t.id, name: t.name, tokenPrefix: t.tokenPrefix, tokenFull: t.tokenFull, scopes, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt, expiresAt: t.expiresAt || null };
      });
      res.json(tokens);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  delete: (req, res) => {
    try {
      const success = TokenModel.delete(req.params.id);
      if (!success) return res.status(404).json({ error: 'Token not found' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
,

  create: (req, res) => {
    try {
      const { name, scopes, expiresAt } = req.body || {};
      const token = TokenModel.create({ name, scopes, expiresAt });
      let scopesArr = [];
      try { scopesArr = JSON.parse(token.scopes || '[]'); } catch (e) { scopesArr = []; }
      res.status(201).json({ ...token, scopes: scopesArr });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};
