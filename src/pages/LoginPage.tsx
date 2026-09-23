import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24 }}>
      <div style={{ width: 420, padding: 28, borderRadius: 12, background: 'var(--bg-secondary)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid var(--border-color)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 900, marginBottom: 4 }}>
            C2 <span style={{ color: 'var(--accent-primary)' }}>Platform</span>
          </h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Command & Control Console
          </span>
        </div>
        <p style={{ marginBottom: 18, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Enter your credentials to access the platform.</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="form-label">Email</label>
            <input className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="form-label">Password</label>
            <input type="password" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div style={{ color: '#ef4444' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Signing...' : 'Sign in'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
