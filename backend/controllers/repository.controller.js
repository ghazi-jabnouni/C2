import { RepositoryModel } from '../models/repository.model.js';

export const RepositoryController = {
  getRepositories: (req, res) => {
    try {
      const repos = RepositoryModel.findAll();
      console.log('[repo:get] Returning repositories count=', Array.isArray(repos) ? repos.length : 0);
      res.json(repos);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  getRepositoryById: (req, res) => {
    try {
      const repo = RepositoryModel.findById(req.params.id);
      if (!repo) return res.status(404).json({ error: 'Repository not found' });
      res.json(repo);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  createRepository: (req, res) => {
    try {
      const { name, gitUrl, branch, credentialId, playbooks } = req.body;
      console.log('[repo:create] Incoming payload:', { name, gitUrl, branch, credentialId, playbooks });
      if (!name || !gitUrl) return res.status(400).json({ error: 'Name and gitUrl are required' });

      const newRepo = RepositoryModel.create({ name, gitUrl, branch, credentialId, playbooks });
      console.log('[repo:create] Created:', newRepo && newRepo.id ? newRepo.id : newRepo);
      // Return created repo
      res.status(201).json(newRepo);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  updateRepository: (req, res) => {
    try {
      const existing = RepositoryModel.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Repository not found' });

      const updated = RepositoryModel.update(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  deleteRepository: (req, res) => {
    try {
      const success = RepositoryModel.delete(req.params.id);
      if (!success) return res.status(404).json({ error: 'Repository not found' });
      res.json({ success: true, message: 'Repository deleted successfully' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};

// Sync handler: verifies repository URL reachability and updates status/lastSync
RepositoryController.syncRepository = (req, res) => {
  try {
    const repo = RepositoryModel.findById(req.params.id);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const gitUrl = repo.gitUrl || '';

    (async () => {
      let ok = false;
      try {
        console.log(`[repo:sync] Checking URL: ${gitUrl}`);
        if (gitUrl.startsWith('http')) {
          const resp = await fetch(gitUrl, { method: 'HEAD' });
          console.log(`[repo:sync] HTTP HEAD status: ${resp.status}`);
          ok = resp.ok;
        } else {
          // Non-HTTP URLs (ssh/git) - mark as not reachable by HTTP check
          console.log('[repo:sync] Non-HTTP URL, skipping HEAD check');
          ok = false;
        }
      } catch (err) {
        console.error('[repo:sync] Error checking URL:', err && err.message ? err.message : err);
        ok = false;
      }

      const status = ok ? 'synced' : 'not-synced';
      const lastSync = new Date().toISOString();

      const updated = RepositoryModel.update(req.params.id, { status, lastSync });

      res.json({ message: ok ? 'Repository reachable' : 'Repository not reachable', repo: updated });
    })();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
