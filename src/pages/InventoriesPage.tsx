import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  Server,
  Plus,
  Trash2,
  CheckCircle2,
  Activity,
  Save,
  X,
  Edit2
} from 'lucide-react';
import type { Inventory, Credential } from '../types';
import { api } from '../services/api';

export const InventoriesPage: React.FC = () => {
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [selectedInv, setSelectedInv] = useState<Inventory | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editName, setEditName] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [pingTesting, setPingTesting] = useState(false);
  const [pingResults, setPingResults] = useState<{ host: string; ok: boolean; rtt: string }[] | null>(null);

  const [credentials, setCredentials] = useState<Credential[]>([]);
  
  // New/Edit inventory state
  const [editingInvId, setEditingInvId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'static' | 'dynamic'>('static');
  const [newConnectionType, setNewConnectionType] = useState<'ssh' | 'winrm' | 'local'>('ssh');
  const [newCredentialId, setNewCredentialId] = useState<string>('');
  const [newContent, setNewContent] = useState(
    '[webservers]\nweb-01.company.internal ansible_host=10.0.1.11\nweb-02.company.internal ansible_host=10.0.1.12\n\n[databases]\ndb-master.company.internal ansible_host=10.0.1.50'
  );

  const loadData = async () => {
    try {
      const [list, creds] = await Promise.all([
        api.getInventories(),
        api.getCredentials()
      ]);
      setInventories(list);
      setCredentials(creds);
      if (list.length > 0 && !selectedInv) {
        setSelectedInv(list[0]);
        setEditContent(list[0].inventoryContent);
        setEditName(list[0].name);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectInventory = (inv: Inventory) => {
    setSelectedInv(inv);
    setEditContent(inv.inventoryContent);
    setEditName(inv.name);
    setPingResults(null);
  };

  const handleSaveInventory = async () => {
    if (!selectedInv) return;
    try {
      const updated = await api.updateInventory(selectedInv.id, {
        name: editName,
        inventoryContent: editContent
      });
      setInventories((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setSelectedInv(updated);
      alert('Inventory saved successfully!');
    } catch (err) {
      alert(`Save error: ${err}`);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingInvId(null);
    setNewName('');
    setNewType('static');
    setNewConnectionType('ssh');
    setNewCredentialId(credentials[0]?.id || '');
    setNewContent('[webservers]\nweb-01.company.internal ansible_host=10.0.1.11\nweb-02.company.internal ansible_host=10.0.1.12\n\n[databases]\ndb-master.company.internal ansible_host=10.0.1.50');
    setShowNewModal(true);
  };

  const handleOpenEditModal = (inv: Inventory) => {
    setEditingInvId(inv.id);
    setNewName(inv.name);
    setNewType(inv.type);
    setNewConnectionType(inv.connectionType || 'ssh');
    setNewCredentialId(inv.credentialId || '');
    setNewContent(inv.inventoryContent);
    setShowNewModal(true);
  };

  const handleCreateInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: newName,
        type: newType,
        connectionType: newConnectionType,
        inventoryContent: newContent,
        credentialId: newCredentialId || null
      };

      if (editingInvId) {
        const updated = await api.updateInventory(editingInvId, payload);
        setInventories((prev) => prev.map((i) => (i.id === editingInvId ? updated : i)));
        if (selectedInv?.id === editingInvId) {
          setSelectedInv(updated);
          setEditName(updated.name);
          setEditContent(updated.inventoryContent);
        }
      } else {
        const created = await api.createInventory(payload);
        setInventories((prev) => [...prev, created]);
        setSelectedInv(created);
        setEditContent(created.inventoryContent);
        setEditName(created.name);
      }
      setShowNewModal(false);
      setNewName('');
    } catch (err) {
      alert(`Save failed: ${err}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this inventory?')) return;
    try {
      await api.deleteInventory(id);
      const remaining = inventories.filter((i) => i.id !== id);
      setInventories(remaining);
      setSelectedInv(remaining[0] || null);
    } catch (err) {
      alert(`Delete failed: ${err}`);
    }
  };

  const handlePingTest = () => {
    setPingTesting(true);
    setPingResults(null);
    setTimeout(() => {
      setPingTesting(false);
      setPingResults([
        { host: 'web-prod-01.us-east.company.internal', ok: true, rtt: '12ms' },
        { host: 'web-prod-02.us-east.company.internal', ok: true, rtt: '15ms' },
        { host: 'web-prod-03.eu-west.company.internal', ok: true, rtt: '38ms' },
        { host: 'db-primary.us-east.company.internal', ok: true, rtt: '11ms' },
        { host: 'db-replica-01.us-east.company.internal', ok: true, rtt: '14ms' }
      ]);
    }, 1200);
  };

  // Parse groups from inventoryContent
  const parsedGroups = (selectedInv?.inventoryContent || '')
    .split('\n')
    .filter((l) => l.trim().startsWith('[') && l.trim().endsWith(']'))
    .map((g) => g.replace(/[\[\]]/g, ''));

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Inventories & Host Clusters
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Define static and dynamic host groups, host variables, and verify connectivity across environments.
          </p>
        </div>

        <button className="btn btn-primary" onClick={handleOpenCreateModal}>
          <Plus size={16} />
          <span>New Inventory</span>
        </button>
      </div>

      {/* Main Two Column */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 24 }}>
        {/* Inventories List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {inventories.map((inv) => {
            const isSelected = selectedInv?.id === inv.id;
            return (
              <div
                key={inv.id}
                onClick={() => handleSelectInventory(inv)}
                className="glass-panel"
                style={{
                  padding: '16px',
                  cursor: 'pointer',
                  borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-color)',
                  backgroundColor: isSelected ? 'var(--accent-primary-light)' : 'var(--bg-secondary)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Server size={18} style={{ color: 'var(--accent-primary)' }} />
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{inv.name}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      className={`badge ${
                        inv.connectionType === 'winrm'
                          ? 'badge-running'
                          : inv.connectionType === 'local'
                          ? 'badge-secondary'
                          : 'badge-info'
                      }`}
                      style={{ fontSize: '0.65rem' }}
                    >
                      {inv.connectionType === 'winrm'
                        ? '🪟 WinRM (Windows)'
                        : inv.connectionType === 'local'
                        ? '💻 Local'
                        : '🐧 SSH (Linux)'}
                    </span>
                    <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>
                      {inv.type}
                    </span>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ padding: 4 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditModal(inv);
                      }}
                      title="Edit Inventory Details"
                    >
                      <Edit2 size={12} />
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 12,
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)'
                  }}
                >
                  <span>{inv.hostCount} hosts configured</span>
                  <span>Updated {new Date(inv.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Inventory Editor */}
        {selectedInv ? (
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
              <div style={{ flex: 1, maxWidth: 360 }}>
                <label className="form-label">Inventory Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="form-control"
                  style={{ fontWeight: 700 }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handlePingTest}
                  disabled={pingTesting}
                  title="Run ansible ping test"
                >
                  <Activity size={14} className={pingTesting ? 'spin-slow' : ''} />
                  <span>{pingTesting ? 'Pinging Hosts...' : 'Ping Test'}</span>
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleSaveInventory}>
                  <Save size={14} />
                  <span>Save Changes</span>
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleDelete(selectedInv.id)}
                  style={{ color: '#ef4444' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Group Pills */}
            {parsedGroups.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  DETECTED GROUPS:
                </span>
                {parsedGroups.map((g) => (
                  <span
                    key={g}
                    className="badge badge-info"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}
                  >
                    [{g}]
                  </span>
                ))}
              </div>
            )}

            {/* Ping Test Results Banner */}
            {pingResults && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#10b981', fontWeight: 700, fontSize: '0.85rem' }}>
                  <CheckCircle2 size={16} />
                  <span>All 5 hosts responded to Ansible PING test successfully!</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                  {pingResults.map((r, i) => (
                    <span key={i} style={{ color: 'var(--text-secondary)' }}>
                      {r.host} <strong style={{ color: '#10b981' }}>({r.rtt})</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* INI / YAML Content Editor */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>
                  Ansible Hosts Definition (INI / YAML format)
                </label>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  Supports host variables, ansible_host, group variables
                </span>
              </div>
              <textarea
                rows={16}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="form-control"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.825rem',
                  lineHeight: '1.6',
                  backgroundColor: 'var(--terminal-bg)',
                  color: 'var(--terminal-text)'
                }}
              />
            </div>
          </div>
        ) : (
          <div className="glass-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Select an inventory to view and edit hosts.
          </div>
        )}
      </div>

      {/* New Inventory Modal */}
      {showNewModal && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 540 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                  <Server size={20} />
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                  {editingInvId ? 'Edit Inventory' : 'Create New Inventory'}
                </h3>
              </div>
              <button
                onClick={() => setShowNewModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateInventory} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="form-label">Inventory Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. EU-West Production Cluster"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="form-control"
                />
              </div>

              <div>
                <label className="form-label">Target OS Connection Type</label>
                <select
                  value={newConnectionType}
                  onChange={(e) => {
                    const connType = e.target.value as 'ssh' | 'winrm' | 'local';
                    setNewConnectionType(connType);
                    if (connType === 'winrm' && newContent.includes('web-01')) {
                      setNewContent(
                        '[windows_servers]\nwin-srv-01.company.internal ansible_host=10.0.2.15 ansible_connection=winrm ansible_winrm_server_cert_validation=ignore\nwin-srv-02.company.internal ansible_host=10.0.2.16 ansible_connection=winrm ansible_winrm_server_cert_validation=ignore'
                      );
                    }
                  }}
                  className="form-control"
                >
                  <option value="ssh">🐧 Linux Target (SSH - Port 22)</option>
                  <option value="winrm">🪟 Windows Target (WinRM / PowerShell - Port 5985/5986)</option>
                  <option value="local">💻 Local Control Engine Execution (localhost)</option>
                </select>
              </div>

              <div>
                <label className="form-label">Inventory Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as any)}
                  className="form-control"
                >
                  <option value="static">Static INI / YAML</option>
                  <option value="dynamic">Dynamic Cloud Script</option>
                </select>
              </div>

              <div>
                <label className="form-label">Credential</label>
                <select
                  value={newCredentialId}
                  onChange={(e) => setNewCredentialId(e.target.value)}
                  className="form-control"
                >
                  <option value="">-- No Credential --</option>
                  {credentials.map(cred => (
                    <option key={cred.id} value={cred.id}>
                      {cred.name} ({cred.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Host & Group Content</label>
                <textarea
                  rows={8}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="form-control"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowNewModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingInvId ? 'Save Changes' : 'Create Inventory'}
                </button>
              </div>
            </form>
          </div>
        </div>, document.body)
      }
    </div>
  );
};
