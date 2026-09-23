import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Trash2,
  Edit3,
  ShieldCheck,
  ShieldAlert,
  Search,
  CheckCircle2,
  Mail,
  Clock,
  X
} from 'lucide-react';
import type { User } from '../types';
import { api } from '../services/api';

export const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'Admin' | 'Operator' | 'Read-Only' | 'Requester'>('Operator');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const loadData = async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.createUser({ name, email, role, password } as any);
      setUsers((prev) => [...prev, created]);
      setShowAddModal(false);
      setName('');
      setEmail('');
      setPassword('');
    } catch (err) {
      alert(`Create user failed: ${err}`);
    }
  };

  const openEdit = (user: User) => {
    setEditingUserId(user.id);
    setName(user.name);
    setEmail(user.email);
    setRole(user.role as any);
    setPassword('');
    setShowEditModal(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;
    try {
      const payload: any = { name, email, role };
      if (password) payload.password = password;
      const updated = await api.updateUser(editingUserId, payload as any);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setShowEditModal(false);
      setEditingUserId(null);
      setName('');
      setEmail('');
      setPassword('');
    } catch (err) {
      alert(`Update user failed: ${err}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this user from team access?')) return;
    try {
      await api.deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      alert(`Delete user failed: ${err}`);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const adminCount = users.filter((u) => u.role === 'Admin').length;
  const operatorCount = users.filter((u) => u.role === 'Operator').length;
  const readOnlyCount = users.filter((u) => u.role === 'Read-Only').length;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Team Directory & Access Control (RBAC)
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Manage platform operators, administrators, audit logins, and execution scope permissions.
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={16} />
          <span>Invite Team Member</span>
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ padding: 10, borderRadius: 8, backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
            <Users size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{users.length}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Members</div>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ padding: 10, borderRadius: 8, backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' }}>
            <ShieldAlert size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{adminCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Administrators</div>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ padding: 10, borderRadius: 8, backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{operatorCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Operators</div>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ padding: 10, borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{readOnlyCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Read-Only Users</div>
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div style={{ position: 'relative', maxWidth: 380 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Filter members by name, email, or role..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="form-control"
          style={{ paddingLeft: 36, height: 38 }}
        />
      </div>

      {/* Team Member List View */}
      <div className="glass-panel" style={{ padding: '0px', overflow: 'hidden' }}>
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
                <th style={{ padding: '14px 20px' }}>Member Profile</th>
                <th style={{ padding: '14px 20px' }}>Assigned Role</th>
                <th style={{ padding: '14px 20px' }}>Status</th>
                <th style={{ padding: '14px 20px' }}>Last Activity</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No team members found matching "{searchQuery}".
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      transition: 'background-color 0.15s ease'
                    }}
                  >
                    {/* User Profile */}
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            backgroundColor: 'rgba(0,0,0,0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            color: 'var(--text-primary)'
                          }}>
                          {user.name ? user.name.split(' ').map(n => n[0]).slice(0,2).join('') : 'U'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.925rem' }}>
                            {user.name}
                          </div>
                          <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Mail size={12} />
                            <span>{user.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td style={{ padding: '14px 20px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: '0.775rem',
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: 6,
                          backgroundColor:
                            user.role === 'Admin'
                              ? 'rgba(239, 68, 68, 0.12)'
                              : user.role === 'Operator'
                              ? 'rgba(59, 130, 246, 0.12)'
                              : 'rgba(16, 185, 129, 0.12)',
                          color:
                            user.role === 'Admin'
                              ? '#ef4444'
                              : user.role === 'Operator'
                              ? '#3b82f6'
                              : '#10b981',
                          border: `1px solid ${
                            user.role === 'Admin'
                              ? 'rgba(239, 68, 68, 0.25)'
                              : user.role === 'Operator'
                              ? 'rgba(59, 130, 246, 0.25)'
                              : 'rgba(16, 185, 129, 0.25)'
                          }`
                        }}
                      >
                        <ShieldCheck size={14} />
                        <span>{user.role}</span>
                      </span>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '14px 20px' }}>
                      <span className="badge badge-success" style={{ fontSize: '0.675rem' }}>
                        ACTIVE
                      </span>
                    </td>

                    {/* Last Activity */}
                    <td style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={13} style={{ color: 'var(--text-muted)' }} />
                        <span>{user.lastLogin}</span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openEdit(user)}
                        style={{ marginRight: 8 }}
                        title="Edit Member"
                      >
                        <Edit3 size={14} />
                        <span>Edit</span>
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleDelete(user.id)}
                        style={{ color: '#ef4444' }}
                        title="Remove Member"
                      >
                        <Trash2 size={14} />
                        <span>Remove</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Users size={20} style={{ color: 'var(--accent-primary)' }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Invite Team Member</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. David Miller"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="form-control"
                />
              </div>

              <div>
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="david.miller@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-control"
                />
              </div>

              <div>
                <label className="form-label">Password *</label>
                <input
                  type="password"
                  required
                  placeholder="Enter a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-control"
                />
              </div>

              <div>
                <label className="form-label">Role Assignment</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="form-control"
                >
                  <option value="Admin">Admin (Full Access & Approvals)</option>
                  <option value="Operator">Operator (Execute & Configure Templates)</option>
                  <option value="Requester">Requester (Self-Service Catalog & Requests)</option>
                  <option value="Read-Only">Read-Only (Audit Logs & View Runs)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Users size={20} style={{ color: 'var(--accent-primary)' }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Edit Team Member</h3>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. David Miller"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="form-control"
                />
              </div>

              <div>
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="david.miller@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-control"
                />
              </div>

              <div>
                <label className="form-label">Password (leave blank to keep current)</label>
                <input
                  type="password"
                  placeholder="Enter a new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-control"
                />
              </div>

              <div>
                <label className="form-label">Role Assignment</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="form-control"
                >
                  <option value="Admin">Admin (Full Access & Approvals)</option>
                  <option value="Operator">Operator (Execute & Configure Templates)</option>
                  <option value="Requester">Requester (Self-Service Catalog & Requests)</option>
                  <option value="Read-Only">Read-Only (Audit Logs & View Runs)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
