import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CredentialModel } from '../models/credential.model.js';
import { RepositoryModel } from '../models/repository.model.js';
import { retrieveRepositorySource } from '../services/repository-source.js';

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
      const { name, sourceType = 'git', gitUrl, branch, credentialId, playbooks } = req.body;
      console.log('[repo:create] Incoming payload:', { name, sourceType, gitUrl, branch, credentialId, playbooks });
      if (!name || !gitUrl) return res.status(400).json({ error: 'Name and gitUrl are required' });
      if (!['git', 'http'].includes(sourceType)) return res.status(400).json({ error: 'sourceType must be git or http' });
      if (sourceType === 'http') {
        let url;
        try {
          url = new URL(gitUrl);
        } catch (_) {
          return res.status(400).json({ error: 'HTTP file URL is invalid' });
        }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
          return res.status(400).json({ error: 'HTTP file sources must be public HTTP or HTTPS URLs without embedded credentials' });
        }
      }

      const newRepo = RepositoryModel.create({
        name,
        sourceType,
        gitUrl,
        branch,
        credentialId: sourceType === 'git' ? credentialId : null,
        playbooks
      });
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

// Sync verifies access by cloning the configured branch with the assigned Git credential.
RepositoryController.syncRepository = async (req, res) => {
  let syncDirectory;
  try {
    const repo = RepositoryModel.findById(req.params.id);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    syncDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'automaton-repository-sync-'));
    const sourceType = repo.sourceType || 'git';
    const credential = sourceType === 'git' && repo.credentialId ? CredentialModel.findById(repo.credentialId) : null;
    if (sourceType === 'git' && repo.credentialId && !credential) throw new Error('The credential assigned to this repository was not found.');

    await retrieveRepositorySource({
      sourceType,
      url: repo.gitUrl,
      branch: repo.branch || 'main',
      destination: path.join(syncDirectory, 'repository'),
      credential,
      onOutput: () => {}
    });

    const updated = RepositoryModel.update(req.params.id, {
      status: 'synced',
      lastSync: new Date().toISOString()
    });
    const message = sourceType === 'http'
      ? 'HTTP file is available and was downloaded successfully.'
      : `Repository cloned successfully from branch '${repo.branch || 'main'}'.`;
    res.json({ message, repo: updated });
  } catch (err) {
    const updated = RepositoryModel.update(req.params.id, {
      status: 'error',
      lastSync: new Date().toISOString()
    });
    res.json({ message: `Repository sync failed: ${err.message}`, repo: updated });
  } finally {
    if (syncDirectory) fs.rmSync(syncDirectory, { recursive: true, force: true });
  }
};
