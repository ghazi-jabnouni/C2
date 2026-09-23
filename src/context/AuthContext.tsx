import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';

interface AuthState {
  token: string | null;
  user: any | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [user, setUser] = useState<any | null>(null);

  useEffect(() => {
    if (token) {
      localStorage.setItem('auth_token', token);
      // fetch current user
      api.getUsers(); // warmup
      (async () => {
        try {
          const me = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => null);
          setUser(me);
        } catch (e) {
          setUser(null);
        }
      })();
    } else {
      localStorage.removeItem('auth_token');
      setUser(null);
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) throw new Error('Login failed');
    const data = await res.json();
    // Persist token synchronously to avoid a timing race where
    // consumers read localStorage before React state/useEffect runs.
    try {
      localStorage.setItem('auth_token', data.token);
    } catch {}
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    const t = localStorage.getItem('auth_token');
    if (t) fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${t}` } }).catch(() => null);
    try {
      localStorage.removeItem('auth_token');
    } catch {}
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>{children}</AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
