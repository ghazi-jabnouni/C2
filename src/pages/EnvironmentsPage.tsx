import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Plus,
  Trash2,
  Save,
  Lock,
  FileJson,
  X
} from 'lucide-react';
import type { Environment } from '../types';

type KVPair = { key: string; value: string };
type KVGroup = { key: string; group: KVPair[] };
type VariablesRow = KVPair | KVGroup;
import { api } from '../services/api';

export const EnvironmentsPage: React.FC = () => {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnv, setSelectedEnv] = useState<Environment | null>(null);
  const [editName, setEditName] = useState('');
  const [variablesJson, setVariablesJson] = useState('{}');
  const [secretsJson, setSecretsJson] = useState('{}');
  const [variablesMode, setVariablesMode] = useState<'json' | 'kv'>('json');
  const [secretsMode, setSecretsMode] = useState<'json' | 'kv'>('json');
  const [variablesKv, setVariablesKv] = useState<VariablesRow[]>([]);
  const [secretsKv, setSecretsKv] = useState<Array<{ key: string; value: string }>>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [createVariablesMode, setCreateVariablesMode] = useState<'json' | 'kv'>('kv');
  const [createVariablesJson, setCreateVariablesJson] = useState('{}');
  const [createVariablesKv, setCreateVariablesKv] = useState<VariablesRow[]>([]);

  const loadData = async () => {
    try {
      const data = await api.getEnvironments();
      setEnvironments(data);
      if (data.length > 0 && !selectedEnv) {
        setSelectedEnv(data[0]);
        setEditName(data[0].name);
        setVariablesJson(JSON.stringify(data[0].variables || {}, null, 2));
        setSecretsJson(JSON.stringify(data[0].secrets || {}, null, 2));
        setVariablesKv(Object.entries(data[0].variables || {}).map(([k, v]) => {
          if (v && typeof v === 'object') {
            return { key: k, group: Object.entries(v).map(([kk, vv]) => ({ key: kk, value: String(vv) })) } as VariablesRow;
          }
          return { key: k, value: String(v) } as VariablesRow;
        }));
        setSecretsKv(Object.entries(data[0].secrets || {}).map(([k, v]) => ({ key: k, value: String(v) })));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelect = (env: Environment) => {
    setSelectedEnv(env);
    setEditName(env.name);
    setVariablesJson(JSON.stringify(env.variables || {}, null, 2));
    setSecretsJson(JSON.stringify(env.secrets || {}, null, 2));
    // populate KV views (support nested objects as groups)
    setVariablesKv(Object.entries(env.variables || {}).map(([k, v]) => {
      if (v && typeof v === 'object') {
        return { key: k, group: Object.entries(v).map(([kk, vv]) => ({ key: kk, value: String(vv) })) } as VariablesRow;
      }
      return { key: k, value: String(v) } as VariablesRow;
    }));
    setSecretsKv(Object.entries(env.secrets || {}).map(([k, v]) => ({ key: k, value: String(v) })));
  };

  const handleSave = async () => {
    if (!selectedEnv) return;
    try {
      const vars = variablesMode === 'json' ? JSON.parse(variablesJson) : variablesKv.reduce((acc, cur) => {
        if (!('key' in cur) || !cur.key) return acc;
        if ((cur as any).group && Array.isArray((cur as any).group)) {
          acc[cur.key] = (cur as any).group.reduce((a: Record<string,string>, r: KVPair) => { if (r.key) a[r.key] = r.value; return a; }, {});
        } else {
          acc[cur.key] = (cur as any).value ?? '';
        }
        return acc;
      }, {} as Record<string, any>);
      const secs = secretsMode === 'json' ? JSON.parse(secretsJson) : secretsKv.reduce((acc, cur) => { if (cur.key) acc[cur.key] = cur.value; return acc; }, {} as Record<string,string>);
      const updated = await api.updateEnvironment(selectedEnv.id, {
        name: editName,
        variables: vars,
        secrets: secs
      });
      setEnvironments((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      setSelectedEnv(updated);
      alert('Environment variables saved!');
    } catch (err) {
      alert(`Invalid JSON format or save error: ${err}`);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const vars = createVariablesMode === 'json'
        ? JSON.parse(createVariablesJson || '{}')
        : createVariablesKv.reduce((acc, cur) => {
            if (!('key' in cur) || !cur.key) return acc;
            if ((cur as any).group && Array.isArray((cur as any).group)) {
              acc[cur.key] = (cur as any).group.reduce((a: Record<string,string>, r: KVPair) => { if (r.key) a[r.key] = r.value; return a; }, {});
            } else {
              acc[cur.key] = (cur as any).value ?? '';
            }
            return acc;
          }, {} as Record<string, any>);

      const created = await api.createEnvironment({
        name: newName,
        variables: vars,
        secrets: {}
      });
      setEnvironments((prev) => [...prev, created]);
      setSelectedEnv(created);
      setEditName(created.name);
      setVariablesJson(JSON.stringify(created.variables, null, 2));
      setSecretsJson(JSON.stringify(created.secrets, null, 2));
      setShowAddModal(false);
      setNewName('');
      setCreateVariablesKv([]);
      setCreateVariablesJson('{}');
      setCreateVariablesMode('kv');
    } catch (err) {
      alert(`Create failed: ${err}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this environment?')) return;
    try {
      await api.deleteEnvironment(id);
      const remaining = environments.filter((e) => e.id !== id);
      setEnvironments(remaining);
      setSelectedEnv(remaining[0] || null);
    } catch (err) {
      alert(`Delete failed: ${err}`);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Environment Profiles
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Configure global and stage-specific environment variables and encrypted secrets injected during playbook runs.
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={16} />
          <span>New Environment</span>
        </button>
      </div>

      {/* Main Two Columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 24 }}>
        {/* Environment List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {environments.map((env) => {
            const isSelected = selectedEnv?.id === env.id;
            const varCount = Object.keys(env.variables || {}).length;
            const secretCount = Object.keys(env.secrets || {}).length;

            return (
              <div
                key={env.id}
                onClick={() => handleSelect(env)}
                className="glass-panel"
                style={{
                  padding: '16px',
                  cursor: 'pointer',
                  borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-color)',
                  backgroundColor: isSelected ? 'var(--accent-primary-light)' : 'var(--bg-secondary)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{env.name}</strong>
                  <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>
                    {varCount} vars
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                  {secretCount > 0 ? `${secretCount} encrypted secret(s)` : 'No secrets attached'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Environment Editor */}
        {selectedEnv ? (
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
              <div style={{ flex: 1, maxWidth: 360 }}>
                <label className="form-label">Environment Profile Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="form-control"
                  style={{ fontWeight: 700 }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={handleSave}>
                  <Save size={14} />
                  <span>Save Profile</span>
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleDelete(selectedEnv.id)}
                  style={{ color: '#ef4444' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Variables Editor (JSON <-> Key/Value) */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileJson size={15} style={{ color: 'var(--accent-primary)' }} />
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    Plaintext Environment Variables
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className={`btn btn-sm ${variablesMode === 'json' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => {
                    // convert KV -> JSON when switching to JSON view
                    try {
                      const obj = variablesKv.reduce((acc, cur) => {
                        if (!('key' in cur) || !cur.key) return acc;
                        if ('group' in cur && Array.isArray(cur.group)) {
                          acc[cur.key] = cur.group.reduce((a: Record<string, string>, r: KVPair) => {
                            if (r.key) a[r.key] = r.value;
                            return a;
                          }, {});
                        } else if ('value' in cur) {
                          acc[cur.key] = cur.value;
                        }
                        return acc;
                      }, {} as Record<string, any>);
                      setVariablesJson(JSON.stringify(obj, null, 2));
                    } catch (_) {}
                    setVariablesMode('json');
                  }}>JSON</button>
                  <button className={`btn btn-sm ${variablesMode === 'kv' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => {
                    // convert JSON -> KV when switching
                    if (variablesMode !== 'kv') {
                      try {
                        const parsed = JSON.parse(variablesJson || '{}');
                        setVariablesKv(Object.entries(parsed || {}).map(([k, v]) => ({ key: k, value: String(v) })));
                      } catch (_) {
                        setVariablesKv([]);
                      }
                    }
                    setVariablesMode('kv');
                  }}>Key/Value</button>
                </div>
              </div>

              {variablesMode === 'json' ? (
                <textarea
                  rows={8}
                  value={variablesJson}
                  onChange={(e) => setVariablesJson(e.target.value)}
                  className="form-control"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.825rem',
                    backgroundColor: 'var(--terminal-bg)',
                    color: 'var(--terminal-text)'
                  }}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {variablesKv.map((row, idx) => {
                    if ((row as any).group && Array.isArray((row as any).group)) {
                      const group = (row as any).group as KVPair[];
                      return (
                        <div key={idx} style={{ border: '1px solid var(--border-color)', padding: 8, borderRadius: 6 }}>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                            <input value={row.key} onChange={(e) => setVariablesKv(prev => { const copy = [...prev]; copy[idx] = { ...(copy[idx] as VariablesRow), key: e.target.value }; return copy; })} placeholder="Group Name" className="form-control" />
                            <button className="btn btn-sm btn-secondary" onClick={() => {
                              // flatten group -> keep as empty value
                              setVariablesKv(prev => { const copy = [...prev]; const item = copy[idx] as VariablesRow; if ((item as any).group) {
                                copy[idx] = { key: item.key, value: '' } as VariablesRow;
                              } return copy; });
                            }}>Flatten</button>
                            <button className="btn btn-danger btn-sm" onClick={() => setVariablesKv(prev => prev.filter((_, i) => i !== idx))}><Trash2 size={14} /></button>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {group.map((g, gi) => (
                              <div key={gi} style={{ display: 'flex', gap: 8 }}>
                                <input value={g.key} onChange={(e) => setVariablesKv(prev => { const copy = [...prev]; (copy[idx] as any).group[gi] = { ...((copy[idx] as any).group[gi]), key: e.target.value }; return copy; })} placeholder="KEY" className="form-control" />
                                <input value={g.value} onChange={(e) => setVariablesKv(prev => { const copy = [...prev]; (copy[idx] as any).group[gi] = { ...((copy[idx] as any).group[gi]), value: e.target.value }; return copy; })} placeholder="value" className="form-control" />
                                <button className="btn btn-danger btn-sm" onClick={() => setVariablesKv(prev => { const copy = [...prev]; (copy[idx] as any).group = (copy[idx] as any).group.filter((_: any, i: number) => i !== gi); return copy; })}><Trash2 size={14} /></button>
                              </div>
                            ))}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button className="btn btn-secondary btn-sm" onClick={() => setVariablesKv(prev => { const copy = [...prev]; (copy[idx] as any).group.push({ key: '', value: '' }); return copy; })}><Plus size={14} /> Add</button>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={idx} style={{ display: 'flex', gap: 8 }}>
                        <input value={(row as any).key} onChange={(e) => setVariablesKv(prev => { const copy = [...prev]; copy[idx] = { ...copy[idx], key: e.target.value }; return copy; })} placeholder="KEY" className="form-control" />
                        <input value={(row as any).value} onChange={(e) => setVariablesKv(prev => { const copy = [...prev]; copy[idx] = { ...copy[idx], value: e.target.value }; return copy; })} placeholder="value" className="form-control" />
                        
                        <button className="btn btn-danger btn-sm" onClick={() => setVariablesKv(prev => prev.filter((_, i) => i !== idx))}><Trash2 size={14} /></button>
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setVariablesKv(prev => [...prev, { key: '', value: '' }])}><Plus size={14} /> Add Variable</button>
                  </div>
                </div>
              )}
            </div>

            {/* Secrets Editor (JSON <-> Key/Value) */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Lock size={15} style={{ color: '#a855f7' }} />
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    Masked & Encrypted Secrets
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className={`btn btn-sm ${secretsMode === 'json' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => {
                    try {
                      const obj = secretsKv.reduce((acc, cur) => { if (cur.key) acc[cur.key] = cur.value; return acc; }, {} as Record<string,string>);
                      setSecretsJson(JSON.stringify(obj, null, 2));
                    } catch (_) {}
                    setSecretsMode('json');
                  }}>JSON</button>
                  <button className={`btn btn-sm ${secretsMode === 'kv' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => {
                    if (secretsMode !== 'kv') {
                      try {
                        const parsed = JSON.parse(secretsJson || '{}');
                        setSecretsKv(Object.entries(parsed || {}).map(([k, v]) => ({ key: k, value: String(v) })));
                      } catch (_) {
                        setSecretsKv([]);
                      }
                    }
                    setSecretsMode('kv');
                  }}>Key/Value</button>
                </div>
              </div>

              {secretsMode === 'json' ? (
                <textarea
                  rows={6}
                  value={secretsJson}
                  onChange={(e) => setSecretsJson(e.target.value)}
                  className="form-control"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.825rem',
                    backgroundColor: 'var(--terminal-bg)',
                    color: 'var(--terminal-text)'
                  }}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {secretsKv.map((row, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 8 }}>
                      <input value={row.key} onChange={(e) => setSecretsKv(prev => { const copy = [...prev]; copy[idx] = { ...copy[idx], key: e.target.value }; return copy; })} placeholder="KEY" className="form-control" />
                      <input value={row.value} onChange={(e) => setSecretsKv(prev => { const copy = [...prev]; copy[idx] = { ...copy[idx], value: e.target.value }; return copy; })} placeholder="value" className="form-control" />
                      <button className="btn btn-danger btn-sm" onClick={() => setSecretsKv(prev => prev.filter((_, i) => i !== idx))}><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setSecretsKv(prev => [...prev, { key: '', value: '' }])}><Plus size={14} /> Add Secret</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="glass-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Select an environment profile to view and configure variables.
          </div>
        )}
      </div>

      {/* New Environment Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                  <Sliders size={20} />
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Create Environment Profile</h3>
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
                <label className="form-label">Profile Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Production Cluster Env"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="form-control"
                />
              </div>

              {/* Create modal: Variables editor */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileJson size={14} style={{ color: 'var(--accent-primary)' }} />
                    <label className="form-label" style={{ marginBottom: 0 }}>Variables</label>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className={`btn btn-sm ${createVariablesMode === 'json' ? 'btn-primary' : 'btn-secondary'}`} type="button" onClick={() => { try { const obj = createVariablesKv.reduce((acc, cur) => { if (!('key' in cur) || !cur.key) return acc; if ((cur as any).group) acc[cur.key] = (cur as any).group.reduce((a: Record<string,string>, r: KVPair) => { if (r.key) a[r.key] = r.value; return a; }, {}); else acc[cur.key] = (cur as any).value ?? ''; return acc; }, {} as Record<string,any>); setCreateVariablesJson(JSON.stringify(obj, null, 2)); } catch(_){} setCreateVariablesMode('json'); }}>JSON</button>
                    <button className={`btn btn-sm ${createVariablesMode === 'kv' ? 'btn-primary' : 'btn-secondary'}`} type="button" onClick={() => { if (createVariablesMode !== 'kv') { try { const parsed = JSON.parse(createVariablesJson || '{}'); setCreateVariablesKv(Object.entries(parsed || {}).map(([k, v]) => { if (v && typeof v === 'object') return { key: k, group: Object.entries(v).map(([kk, vv]) => ({ key: kk, value: String(vv) })) } as VariablesRow; return { key: k, value: String(v) } as VariablesRow; })); } catch(_) { setCreateVariablesKv([]); } } setCreateVariablesMode('kv'); }}>Key/Value</button>
                  </div>
                </div>

                {createVariablesMode === 'json' ? (
                  <textarea rows={6} value={createVariablesJson} onChange={(e) => setCreateVariablesJson(e.target.value)} className="form-control" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.825rem' }} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {createVariablesKv.map((row, idx) => {
                      if ((row as any).group && Array.isArray((row as any).group)) {
                        const group = (row as any).group as KVPair[];
                        return (
                          <div key={idx} style={{ border: '1px solid var(--border-color)', padding: 8, borderRadius: 6 }}>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                              <input value={row.key} onChange={(e) => setCreateVariablesKv(prev => { const copy = [...prev]; copy[idx] = { ...(copy[idx] as VariablesRow), key: e.target.value }; return copy; })} placeholder="Group Name" className="form-control" />
                              <button className="btn btn-danger btn-sm" type="button" onClick={() => setCreateVariablesKv(prev => prev.filter((_, i) => i !== idx))}><Trash2 size={14} /></button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {group.map((g, gi) => (
                                <div key={gi} style={{ display: 'flex', gap: 8 }}>
                                  <input value={g.key} onChange={(e) => setCreateVariablesKv(prev => { const copy = [...prev]; (copy[idx] as any).group[gi] = { ...((copy[idx] as any).group[gi]), key: e.target.value }; return copy; })} placeholder="KEY" className="form-control" />
                                  <input value={g.value} onChange={(e) => setCreateVariablesKv(prev => { const copy = [...prev]; (copy[idx] as any).group[gi] = { ...((copy[idx] as any).group[gi]), value: e.target.value }; return copy; })} placeholder="value" className="form-control" />
                                  <button className="btn btn-danger btn-sm" type="button" onClick={() => setCreateVariablesKv(prev => { const copy = [...prev]; (copy[idx] as any).group = (copy[idx] as any).group.filter((_: any, i: number) => i !== gi); return copy; })}><Trash2 size={14} /></button>
                                </div>
                              ))}
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-secondary btn-sm" type="button" onClick={() => setCreateVariablesKv(prev => { const copy = [...prev]; (copy[idx] as any).group.push({ key: '', value: '' }); return copy; })}><Plus size={14} /> Add</button>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={idx} style={{ display: 'flex', gap: 8 }}>
                          <input value={(row as any).key} onChange={(e) => setCreateVariablesKv(prev => { const copy = [...prev]; copy[idx] = { ...copy[idx], key: e.target.value }; return copy; })} placeholder="KEY" className="form-control" />
                          <input value={(row as any).value} onChange={(e) => setCreateVariablesKv(prev => { const copy = [...prev]; copy[idx] = { ...copy[idx], value: e.target.value }; return copy; })} placeholder="value" className="form-control" />
                          
                          <button className="btn btn-danger btn-sm" type="button" onClick={() => setCreateVariablesKv(prev => prev.filter((_, i) => i !== idx))}><Trash2 size={14} /></button>
                        </div>
                      );
                    })}
                    <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8 }}>
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => setCreateVariablesKv(prev => [...prev, { key: '', value: '' } as VariablesRow])}><Plus size={14} /> Add Variable</button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
