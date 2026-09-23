import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Copy, Check } from 'lucide-react';
import type { ApiToken } from '../types';
import { api } from '../services/api';

export const ApiTokensPage: React.FC = () => {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['tasks:create']);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<ApiToken | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const loadData = async () => {
    try {
      const data = await api.getTokens();
      setTokens(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!showNewModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowNewModal(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showNewModal]);

  useEffect(() => {
    if (showNewModal && nameInputRef.current) {
      try { nameInputRef.current.focus(); } catch (_) {}
    }
  }, [showNewModal]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const availableScopes = [
    { id: 'tasks:create', label: 'Trigger & Execute Tasks' },
    { id: 'tasks:run', label: 'Run Tasks' },
    { id: 'tasks:request', label: 'Request Task Runs (approval workflow)' },
    { id: 'tasks:read', label: 'Read Execution Output & Logs' },
    { id: 'templates:read', label: 'Inspect Templates & Playbooks' }
  ];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const expiresAt = selectedExpiry ? new Date(selectedExpiry).toISOString() : null;
      const created = await api.createToken({ name: tokenName, scopes: selectedScopes, expiresAt });
      setTokens((prev) => [created, ...prev]);
      setNewlyCreatedToken(created);
      setTokenName('');
      setShowNewModal(false);
    } catch (err) {
      alert(`Create token failed: ${err}`);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            API Tokens
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Active tokens. You can copy or revoke tokens here.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowNewModal(true); setNewlyCreatedToken(null); }}>
          Generate API Token
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '18px 20px', backgroundColor: 'var(--bg-secondary)', borderLeft: '4px solid var(--accent-primary)' }}>
        <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '8px' }}>Webhook POST Action URL</h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Use this URL to trigger tasks programmatically via a POST request. You must include your API token in the <code>Authorization: Bearer &lt;token&gt;</code> header or as a query parameter (<code>?token=...</code>).
          Include <code>{"{"} "action": "run" {"}"}</code> in your JSON payload to run tasks.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <code style={{ flex: 1, padding: '10px 12px', backgroundColor: 'var(--terminal-bg)', color: '#34d399', borderRadius: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', border: '1px solid var(--border-color)' }}>
            {typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}/api/v1/webhooks/trigger` : 'http://localhost:5000/api/v1/webhooks/trigger'}
          </code>
          <button
            className="btn btn-secondary"
            onClick={() => handleCopy(typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}/api/v1/webhooks/trigger` : 'http://localhost:5000/api/v1/webhooks/trigger', 'webhook-url')}
            title="Copy Webhook URL"
          >
            {copiedId === 'webhook-url' ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Active API Tokens ({tokens.length})</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tokens.map((tok) => (
            <div key={tok.id} className="glass-panel" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>{tok.name}</strong>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent-primary)' }}>
                      {tok.tokenPrefix}••••••••••••
                    </code>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleCopy(tok.tokenFull, tok.id)}
                    title="Copy Token"
                  >
                    {copiedId === tok.id ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={async () => {
                      if (!confirm('Revoke this token? This cannot be undone.')) return;
                      try {
                        await api.deleteToken(tok.id);
                        setTokens((prev) => prev.filter((t) => t.id !== tok.id));
                      } catch (err) {
                        alert(`Failed to delete token: ${err}`);
                      }
                    }}
                    title="Revoke Token"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(tok.scopes || []).map((s) => (
                  <span key={s} className="badge badge-info" style={{ fontSize: '0.65rem' }}>
                    {s}
                  </span>
                ))}
              </div>

              <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                Created {new Date(tok.createdAt).toLocaleDateString()}
                {tok.lastUsedAt && ` • Last used ${new Date(tok.lastUsedAt).toLocaleTimeString()}`}
                {' • '}Expires: {tok.expiresAt ? new Date(tok.expiresAt).toLocaleString() : 'Never'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Generate Modal */}
      {showNewModal && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 1000 }}>
          <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', padding: '24px', maxWidth: 520, width: 'min(96%,520px)', maxHeight: '90vh', overflowY: 'auto', borderRadius: 8, boxShadow: '0 8px 30px rgba(0,0,0,0.35)', background: 'var(--bg-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Generate API Token</h3>
              </div>
              <button
                onClick={() => setShowNewModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>

            {newlyCreatedToken ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    padding: '14px',
                    borderRadius: 8,
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    fontSize: '0.85rem'
                  }}
                >
                  <strong style={{ color: '#10b981', display: 'block', marginBottom: 4 }}>
                    Token Generated Successfully!
                  </strong>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Copy your API token now. You will not be able to view the full secret key again.
                  </span>
                </div>

                <div
                  style={{
                    padding: '12px',
                    borderRadius: 6,
                    backgroundColor: 'var(--terminal-bg)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                    color: '#34d399',
                    wordBreak: 'break-all',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10
                  }}
                >
                  <span>{newlyCreatedToken.tokenFull}</span>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleCopy(newlyCreatedToken.tokenFull, 'new-tok')}
                  >
                    {copiedId === 'new-tok' ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  </button>
                </div>

                <button className="btn btn-primary" onClick={() => setShowNewModal(false)}>
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="form-label">Token Name / Description *</label>
                  <input
                    ref={nameInputRef}
                    type="text"
                    required
                    placeholder="e.g. Jenkins Staging Runner Token"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div>
                  <label className="form-label">Permission Scopes</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {availableScopes.map((s) => {
                      const checked = selectedScopes.includes(s.id);
                      return (
                        <label
                          key={s.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            fontSize: '0.825rem',
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              if (checked) {
                                setSelectedScopes((prev) => prev.filter((x) => x !== s.id));
                              } else {
                                setSelectedScopes((prev) => [...prev, s.id]);
                              }
                            }}
                          />
                          <span>
                            <strong style={{ fontFamily: 'var(--font-mono)' }}>{s.id}</strong> — {s.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="form-label">Expires</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="datetime-local"
                      value={selectedExpiry}
                      onChange={(e) => setSelectedExpiry(e.target.value)}
                      className="form-control"
                    />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelectedExpiry('')}>Never</button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowNewModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Create Token
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>, document.body)}
    </div>
  );
};
