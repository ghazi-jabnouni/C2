import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
  KeyRound,
  Plus,
  Trash2,
  Lock,
  Key,
  ShieldCheck,
  Eye,
  EyeOff,
  Copy,
  Check,
  X,
  Cloud,
  Search,
  Edit3,
  UserRound
} from 'lucide-react';
import type { Credential } from '../types';
import { api } from '../services/api';

const getCredentialTypeLabel = (type: string) => type.replace('_', ' ').toUpperCase();

const getCredentialSecretValue = (credential: Credential) => {
  switch (credential.type) {
    case 'ssh_key':
      return credential.sshKey || '';
    case 'vault_password':
      return credential.vaultPassword || '';
    case 'password':
      return credential.password || '';
    case 'token':
    case 'cloud_token':
      return credential.secretToken || credential.password || '';
    case 'active_directory':
      return credential.password || credential.secretToken || '';
    case 'microsoft':
      return credential.msClientSecret || credential.msClientId || credential.msTenant || '';
    default:
      return '';
  }
};

export const CredentialsPage: React.FC = () => {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCredentialId, setSelectedCredentialId] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCredentialId, setEditingCredentialId] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState<'ssh_key' | 'vault_password' | 'cloud_token' | 'password' | 'microsoft' | 'token' | 'active_directory'>('ssh_key');
  const [username, setUsername] = useState('ubuntu');
  const [sshKey, setSshKey] = useState('');
  const [vaultPassword, setVaultPassword] = useState('');
  const [sudoPassword, setSudoPassword] = useState('');
  const [password, setPassword] = useState('');
  const [secretToken, setSecretToken] = useState('');
  const [msClientId, setMsClientId] = useState('');
  const [msClientSecret, setMsClientSecret] = useState('');
  const [msTenant, setMsTenant] = useState('');
  const [domain, setDomain] = useState('CORP.INTERNAL');
  const [adAuthMethod, setAdAuthMethod] = useState<'ntlm' | 'kerberos' | 'credssp' | 'ldap'>('ntlm');

  const loadData = async () => {
    try {
      const data = await api.getCredentials();
      setCredentials(data);
      if (!selectedCredentialId && data.length > 0) {
        setSelectedCredentialId(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!showAddModal && !showEditModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddModal(false);
        setShowEditModal(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showAddModal, showEditModal]);

  useEffect(() => {
    if ((showAddModal || showEditModal) && nameInputRef.current) {
      try { nameInputRef.current.focus(); } catch (_) {}
    }
  }, [showAddModal, showEditModal]);

  const filteredCredentials = credentials.filter((cred) =>
    cred.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cred.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cred.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedCredential = credentials.find((cred) => cred.id === selectedCredentialId) || null;

  const resetForm = () => {
    setName('');
    setType('ssh_key');
    setUsername('ubuntu');
    setSshKey('');
    setVaultPassword('');
    setSudoPassword('');
    setPassword('');
    setSecretToken('');
    setMsClientId('');
    setMsClientSecret('');
    setMsTenant('');
    setDomain('CORP.INTERNAL');
    setAdAuthMethod('ntlm');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.createCredential({
        name,
        type,
        username,
        sshKey,
        vaultPassword,
        sudoPassword,
        password,
        secretToken,
        msClientId,
        msClientSecret,
        msTenant,
        domain,
        adAuthMethod
      });
      setCredentials((prev) => [...prev, created]);
      setSelectedCredentialId(created.id);
      setShowAddModal(false);
      resetForm();
    } catch (err) {
      alert(`Create failed: ${err}`);
    }
  };

  const openEdit = (credential: Credential) => {
    setEditingCredentialId(credential.id);
    setName(credential.name);
    setType(credential.type as any);
    setUsername(credential.username || 'ubuntu');
    setSshKey(credential.sshKey || '');
    setVaultPassword(credential.vaultPassword || '');
    setSudoPassword(credential.sudoPassword || '');
    setPassword(credential.password || '');
    setSecretToken(credential.secretToken || '');
    setMsClientId(credential.msClientId || '');
    setMsClientSecret(credential.msClientSecret || '');
    setMsTenant(credential.msTenant || '');
    setDomain(credential.domain || 'CORP.INTERNAL');
    setAdAuthMethod(credential.adAuthMethod || 'ntlm');
    setShowEditModal(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCredentialId) return;
    try {
      const updated = await api.updateCredential(editingCredentialId, {
        name,
        type,
        username,
        sshKey,
        vaultPassword,
        sudoPassword,
        password,
        secretToken,
        msClientId,
        msClientSecret,
        msTenant,
        domain,
        adAuthMethod
      });
      setCredentials((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setSelectedCredentialId(updated.id);
      setShowEditModal(false);
      setEditingCredentialId(null);
      resetForm();
    } catch (err) {
      alert(`Update failed: ${err}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this credential?')) return;
    try {
      await api.deleteCredential(id);
      setCredentials((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (selectedCredentialId === id) {
          setSelectedCredentialId(next[0]?.id || null);
          setShowProfileModal(false);
        }
        return next;
      });
    } catch (err) {
      alert(`Delete failed: ${err}`);
    }
  };

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Key Store & Credentials Vault
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Search, manage, and access stored credentials by profile with secure reveal controls.
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={16} />
          <span>Add Credential</span>
        </button>
      </div>

      <div style={{ position: 'relative', maxWidth: 420 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Search by name, username, or type..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="form-control"
          style={{ paddingLeft: 36, height: 38 }}
        />
      </div>

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', textAlign: 'left', fontSize: '0.75rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                <th style={{ padding: '14px 20px' }}>Credential Profile</th>
                <th style={{ padding: '14px 20px' }}>Type</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCredentials.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No credentials found matching "{searchQuery}".
                  </td>
                </tr>
              ) : (
                filteredCredentials.map((cred) => {
                  const isSelected = selectedCredentialId === cred.id;
                  return (
                    <tr
                      key={cred.id}
                      onClick={() => {
                        setSelectedCredentialId(cred.id);
                        setShowProfileModal(true);
                      }}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.06)' : 'transparent',
                        cursor: 'pointer'
                      }}
                    >
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            backgroundColor: 'rgba(59, 130, 246, 0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#3b82f6'
                          }}>
                            {cred.type === 'ssh_key' ? <Key size={18} /> : cred.type === 'vault_password' ? <Lock size={18} /> : cred.type === 'microsoft' ? <Key size={18} /> : cred.type === 'token' || cred.type === 'cloud_token' ? <Cloud size={18} /> : <UserRound size={18} />}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{cred.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cred.id}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span className="badge badge-info" style={{ fontSize: '0.66rem' }}>
                          {getCredentialTypeLabel(cred.type)}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => openEdit(cred)}
                          style={{ marginRight: 8 }}
                          title="Edit Credential"
                        >
                          <Edit3 size={14} />
                          <span>Edit</span>
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleDelete(cred.id)}
                          style={{ color: '#ef4444' }}
                          title="Remove Credential"
                        >
                          <Trash2 size={14} />
                          <span>Delete</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showProfileModal && selectedCredential && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 560 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Credential profile</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>{selectedCredential.name}</div>
                </div>
              </div>
              <button onClick={() => setShowProfileModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Username</span>
                <strong style={{ color: 'var(--text-primary)' }}>{selectedCredential.username || 'root'}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Type</span>
                <span className="badge badge-info" style={{ fontSize: '0.68rem' }}>
                  {getCredentialTypeLabel(selectedCredential.type)}
                </span>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Stored data</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => toggleReveal(`${selectedCredential.id}-detail`)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      {revealedIds[`${selectedCredential.id}-detail`] ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(getCredentialSecretValue(selectedCredential), `${selectedCredential.id}-detail`)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      {copiedId === `${selectedCredential.id}-detail` ? <Check size={15} color="#10b981" /> : <Copy size={15} />}
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.78rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    minHeight: 80
                  }}
                >
                  {revealedIds[`${selectedCredential.id}-detail`] ? getCredentialSecretValue(selectedCredential) || 'No data stored' : '••••••••••••••••••••••••••••••••'}
                </div>
              </div>
            </div>
          </div>
        </div>, document.body)}

      {showAddModal && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 540 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                  <KeyRound size={20} />
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Store New Credential</h3>
              </div>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="form-label">Credential Alias *</label>
                <input ref={nameInputRef} type="text" required placeholder="e.g. AWS Production Bastion SSH Key" value={name} onChange={(e) => setName(e.target.value)} className="form-control" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Credential Type</label>
                  <select value={type} onChange={(e) => setType(e.target.value as any)} className="form-control">
                    <option value="ssh_key">SSH Private Key</option>
                    <option value="vault_password">Ansible Vault Password</option>
                    <option value="cloud_token">Cloud IAM API Token</option>
                    <option value="password">Login Password</option>
                    <option value="token">Secret Token</option>
                    <option value="active_directory">🪟 Active Directory (AD Domain User)</option>
                    <option value="microsoft">Microsoft OAuth/App Registration</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Remote Username / AD Account</label>
                  <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="form-control" placeholder="administrator / svc_ansible" />
                </div>
              </div>

              {type === 'active_directory' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="form-label">Windows AD Domain</label>
                      <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)} className="form-control" placeholder="e.g. CORP.INTERNAL or COMPANY" />
                    </div>
                    <div>
                      <label className="form-label">AD Authentication Method</label>
                      <select value={adAuthMethod} onChange={(e) => setAdAuthMethod(e.target.value as any)} className="form-control">
                        <option value="ntlm">NTLM (WinRM Default)</option>
                        <option value="kerberos">Kerberos / KINIT</option>
                        <option value="credssp">CredSSP</option>
                        <option value="ldap">LDAP / LDAPS</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Domain Account Password</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="form-control" placeholder="Enter AD user password" />
                  </div>
                </div>
              )}

              {type === 'ssh_key' && (
                <div>
                  <label className="form-label">SSH Private Key (RSA / ED25519)</label>
                  <textarea rows={6} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----" value={sshKey} onChange={(e) => setSshKey(e.target.value)} className="form-control" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.775rem' }} />
                </div>
              )}

              {type === 'vault_password' && (
                <div>
                  <label className="form-label">Vault Password</label>
                  <input type="password" value={vaultPassword} onChange={(e) => setVaultPassword(e.target.value)} className="form-control" placeholder="Enter vault password" />
                </div>
              )}

              {type === 'password' && (
                <div>
                  <label className="form-label">Login Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="form-control" placeholder="Enter login password" />
                </div>
              )}

              {type === 'token' && (
                <div>
                  <label className="form-label">Secret Token</label>
                  <input type="text" value={secretToken} onChange={(e) => setSecretToken(e.target.value)} className="form-control" placeholder="Enter API token or secret" />
                </div>
              )}

              {type === 'microsoft' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="form-label">Client ID</label>
                    <input type="text" value={msClientId} onChange={(e) => setMsClientId(e.target.value)} className="form-control" />
                  </div>
                  <div>
                    <label className="form-label">Client Secret</label>
                    <input type="password" value={msClientSecret} onChange={(e) => setMsClientSecret(e.target.value)} className="form-control" />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Tenant</label>
                    <input type="text" value={msTenant} onChange={(e) => setMsTenant(e.target.value)} className="form-control" />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Credential
                </button>
              </div>
            </form>
          </div>
        </div>, document.body)}

      {showEditModal && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 540 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                  <KeyRound size={20} />
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Edit Credential</h3>
              </div>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="form-label">Credential Alias *</label>
                <input ref={nameInputRef} type="text" required value={name} onChange={(e) => setName(e.target.value)} className="form-control" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Credential Type</label>
                  <select value={type} onChange={(e) => setType(e.target.value as any)} className="form-control">
                    <option value="ssh_key">SSH Private Key</option>
                    <option value="vault_password">Ansible Vault Password</option>
                    <option value="cloud_token">Cloud IAM API Token</option>
                    <option value="password">Login Password</option>
                    <option value="token">Secret Token</option>
                    <option value="active_directory">🪟 Active Directory (AD Domain User)</option>
                    <option value="microsoft">Microsoft OAuth/App Registration</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Remote Username / AD Account</label>
                  <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="form-control" placeholder="administrator / svc_ansible" />
                </div>
              </div>

              {type === 'active_directory' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="form-label">Windows AD Domain</label>
                      <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)} className="form-control" placeholder="e.g. CORP.INTERNAL or COMPANY" />
                    </div>
                    <div>
                      <label className="form-label">AD Authentication Method</label>
                      <select value={adAuthMethod} onChange={(e) => setAdAuthMethod(e.target.value as any)} className="form-control">
                        <option value="ntlm">NTLM (WinRM Default)</option>
                        <option value="kerberos">Kerberos / KINIT</option>
                        <option value="credssp">CredSSP</option>
                        <option value="ldap">LDAP / LDAPS</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Domain Account Password</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="form-control" placeholder="Enter AD user password" />
                  </div>
                </div>
              )}

              {type === 'ssh_key' && (
                <div>
                  <label className="form-label">SSH Private Key (RSA / ED25519)</label>
                  <textarea rows={6} value={sshKey} onChange={(e) => setSshKey(e.target.value)} className="form-control" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.775rem' }} />
                </div>
              )}

              {type === 'vault_password' && (
                <div>
                  <label className="form-label">Vault Password</label>
                  <input type="password" value={vaultPassword} onChange={(e) => setVaultPassword(e.target.value)} className="form-control" placeholder="Enter vault password" />
                </div>
              )}

              {type === 'password' && (
                <div>
                  <label className="form-label">Login Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="form-control" placeholder="Enter login password" />
                </div>
              )}

              {type === 'token' && (
                <div>
                  <label className="form-label">Secret Token</label>
                  <input type="text" value={secretToken} onChange={(e) => setSecretToken(e.target.value)} className="form-control" placeholder="Enter API token or secret" />
                </div>
              )}

              {type === 'microsoft' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="form-label">Client ID</label>
                    <input type="text" value={msClientId} onChange={(e) => setMsClientId(e.target.value)} className="form-control" />
                  </div>
                  <div>
                    <label className="form-label">Client Secret</label>
                    <input type="password" value={msClientSecret} onChange={(e) => setMsClientSecret(e.target.value)} className="form-control" />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Tenant</label>
                    <input type="text" value={msTenant} onChange={(e) => setMsTenant(e.target.value)} className="form-control" />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Update Credential
                </button>
              </div>
            </form>
          </div>
        </div>, document.body)}
    </div>
  );
};
