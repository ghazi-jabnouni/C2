import { Router } from 'express';
import { TokenModel } from '../models/token.model.js';
import { exec } from 'node:child_process';

const router = Router();

// Public webhook trigger endpoint.
// Accepts token via query `?token=` or Authorization header `Bearer <token>`
router.post('/trigger', async (req, res) => {
  try {
    const tokenFromQuery = req.query.token;
    const authHeader = req.headers.authorization;
    const token = tokenFromQuery || (authHeader ? authHeader.replace('Bearer ', '') : null);
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const found = TokenModel.findByFull(token) || TokenModel.findByPrefix(token);
    if (!found) return res.status(401).json({ error: 'Invalid token' });

    // Parse scopes and check expiration
    let scopes = [];
    try { scopes = JSON.parse(found.scopes || '[]'); } catch (e) {}
    // Check expiration
    if (found.expiresAt) {
      const exp = new Date(found.expiresAt);
      if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
        return res.status(403).json({ error: 'Token expired' });
      }
    }

    // If payload requests to run a local script (script path provided), run it.
    // WARNING: Only run scripts configured by trusted systems. This is minimal example.
    const { script, args, action } = req.body || {};
    // If action requests to run a task, ensure token has proper scope
    if (action === 'run') {
      if (scopes.length && !scopes.includes('tasks:run')) {
        return res.status(403).json({ error: 'Token not allowed to run tasks' });
      }
      // handle run request (could integrate with task runner)
      console.log('[webhook] Task run requested via webhook');
    }

    if (action === 'request') {
      if (scopes.length && !scopes.includes('tasks:request')) {
        return res.status(403).json({ error: 'Token not allowed to request tasks' });
      }
      console.log('[webhook] Task request received via webhook');
    }

    if (script) {
      // Basic sanitization: disallow absolute paths
      if (script.startsWith('/') || script.includes('..')) {
        return res.status(400).json({ error: 'Invalid script path' });
      }
      const cmd = `node ${script} ${(args || []).join(' ')}`;
      exec(cmd, { cwd: process.cwd(), timeout: 30_000 }, (err, stdout, stderr) => {
        if (err) {
          console.error('Webhook script error:', err.message);
          return res.status(500).json({ error: 'Script execution failed', details: err.message });
        }
        return res.json({ message: 'Script executed', stdout, stderr });
      });
      return;
    }

    // Otherwise just acknowledge and log payload
    console.log('[webhook] Received payload:', JSON.stringify(req.body).slice(0, 2000));
    res.json({ message: 'Webhook accepted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
