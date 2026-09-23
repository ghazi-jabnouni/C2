import React, { useState, useEffect } from 'react';
import {
  FolderGit2,
  Plus,
  RefreshCw,
  Trash2,
  GitBranch,
  Search,
  Copy,
  Check,
  X,
  CheckCircle2
} from 'lucide-react';
import type { Repository, Credential } from '../types';
import { api } from '../services/api';

export const RepositoriesPage: React.FC = () => {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [copiedUrlId, setCopiedUrlId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [credentialId, setCredentialId] = useState('');

  const loadData = async () => {
    try {
      // Load repositories first (same pattern as UsersPage) to ensure repos are set deterministically
      const repos = await api.getRepositories();
      setRepositories(repos || []);

      // Then load credentials (not blocking repos rendering)
      const creds = await api.getCredentials();
      setCredentials(creds || []);
    } catch (err) {
      console.error('Failed to load repositories or credentials:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCopyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrlId(id);
    setTimeout(() => setCopiedUrlId(null), 2000);
  };

  const handleSync = async (id: string) => {
    try {
      setSyncingId(id);
      await api.syncRepository(id);
      // Refresh full list to ensure UI matches DB state (avoids accidental disappearance)
      await loadData();
    } catch (err) {
      alert(`Sync failed: ${err}`);
    } finally {
      setSyncingId(null);
    }
  };

  const handleCreateRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.createRepository({
        name,
        gitUrl,
        branch,
        credentialId: credentialId || null,
        playbooks: [
          'playbooks/site.yml',
          'playbooks/deploy.yml',
          'playbooks/setup_system.yml'
        ]
      });
      setRepositories((prev) => [...prev, created]);
      setShowAddModal(false);
      setName('');
      setGitUrl('');
      setBranch('main');
      setCredentialId('');
    } catch (err) {
      alert(`Error creating repository: ${err}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this repository?')) return;
    try {
      await api.deleteRepository(id);
      setRepositories((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      alert(`Delete failed: ${err}`);
    }
  };

  const filtered = repositories.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      (r.name || '').toLowerCase().includes(q) ||
      (r.gitUrl || '').toLowerCase().includes(q) ||
      (r.branch || '').toLowerCase().includes(q)
    );
  });

  const syncedCount = repositories.filter((r) => r.status === 'synced').length;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Git Repositories
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Manage Git repositories from GitHub, GitLab, or Bitbucket for automated Ansible playbook execution.
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={16} />
          <span>Connect Repository</span>
        </button>
      </div>

      {/* KPI Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ padding: 10, borderRadius: 8, backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
            <FolderGit2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{repositories.length}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Connected Repositories</div>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ padding: 10, borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{syncedCount} / {repositories.length}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Synced & Ready</div>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ padding: 10, borderRadius: 8, backgroundColor: 'rgba(168, 85, 247, 0.12)', color: '#a855f7' }}>
            <GitBranch size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>main / production</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Default Branches</div>
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div style={{ position: 'relative', maxWidth: 380 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Filter repositories by alias, URL, or branch..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="form-control"
          style={{ paddingLeft: 36, height: 38 }}
        />
      </div>

      

      {/* ========================================================================= */}
      {/* REPOSITORY LIST / TABLE VIEW */}
      {/* ========================================================================= */}
      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  borderBottom: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  textAlign: 'left',
                  fontSize: '0.75rem',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase'
                }}
              >
                <th style={{ padding: '14px 20px' }}>Repository Alias & Branch</th>
                <th style={{ padding: '14px 20px' }}>Git Remote URL</th>
                <th style={{ padding: '14px 20px' }}>Status & Last Sync</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No repositories found matching "{searchQuery}".
                  </td>
                </tr>
              ) : (
                filtered.map((repo) => {
                  const isSyncing = syncingId === repo.id;

                  return (
                    <tr
                      key={repo.id}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      {/* Name + Branch */}
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: 8,
                              backgroundColor: 'rgba(59, 130, 246, 0.12)',
                              color: '#3b82f6',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            <FolderGit2 size={18} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.925rem' }}>
                              {repo.name}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              <GitBranch size={12} />
                              <strong>{repo.branch}</strong>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Git URL */}
                      <td style={{ padding: '14px 20px' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 12px',
                            borderRadius: 6,
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px solid var(--border-color)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.785rem',
                            color: 'var(--text-primary)',
                            maxWidth: '480px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{repo.gitUrl}</span>
                          <button
                            onClick={() => handleCopyUrl(repo.gitUrl, repo.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}
                            title="Copy Git URL"
                          >
                            {copiedUrlId === repo.id ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                          </button>
                        </div>
                      </td>

                      {/* Status & Last Sync */}
                      <td style={{ padding: '14px 20px' }}>
                        <div>
                          {repo.status === 'synced' ? (
                            <span
                              className="badge badge-success"
                              style={{ fontSize: '0.675rem', backgroundColor: 'rgba(16,185,129,0.12)', color: '#10b981' }}
                            >
                              SYNCED
                            </span>
                          ) : (
                            <span
                              className="badge badge-danger"
                              style={{ fontSize: '0.675rem', backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
                            >
                              NOT SYNCED
                            </span>
                          )}

                          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: 4 }}>
                            {repo.lastSync ? `Last sync: ${new Date(repo.lastSync).toLocaleString()}` : 'No sync available'}
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleSync(repo.id)}
                            disabled={isSyncing}
                            title="Pull and sync repository"
                          >
                            <RefreshCw size={13} className={isSyncing ? 'spin-slow' : ''} />
                            <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleDelete(repo.id)}
                            style={{ color: '#ef4444' }}
                            title="Delete Repository"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CONNECT REPOSITORY MODAL */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 540 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                  <FolderGit2 size={20} />
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Connect Git Repository</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateRepo} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="form-label">Repository Alias / Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. enterprise-database-orchestration"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="form-control"
                />
              </div>

              <div>
                <label className="form-label">Git Remote URL *</label>
                <input
                  type="text"
                  required
                  placeholder="https://github.com/org/repo.git or git@github.com:org/repo.git"
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  className="form-control"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Default Branch</label>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div>
                  <label className="form-label">Access Key / Credential</label>
                  <select
                    value={credentialId}
                    onChange={(e) => setCredentialId(e.target.value)}
                    className="form-control"
                  >
                    <option value="">-- Public / None --</option>
                    {credentials.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Connect & Sync
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
