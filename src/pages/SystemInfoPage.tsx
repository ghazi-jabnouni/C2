import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Package,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Layers,
  HardDrive,
  Info,
  ChevronRight
} from 'lucide-react';
import { api } from '../services/api';
import type { SystemInfo, SystemPerformance, AnsibleCollection } from '../types';

/* ──────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                      */
/* ──────────────────────────────────────────────────────────────────────────── */

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/* ──────────────────────────────────────────────────────────────────────────── */
/* Sub-components                                                               */
/* ──────────────────────────────────────────────────────────────────────────── */

const StatusBadge: React.FC<{ available: boolean }> = ({ available }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 10px',
      borderRadius: 999,
      fontSize: '0.72rem',
      fontWeight: 700,
      letterSpacing: '0.03em',
      backgroundColor: available ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
      color: available ? '#22c55e' : '#ef4444',
      border: `1px solid ${available ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
    }}
  >
    {available ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
    {available ? 'Available' : 'Not Found'}
  </span>
);

const InfoRow: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 0',
      borderBottom: '1px solid var(--border-color)',
      gap: 12,
    }}
  >
    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
      {label}
    </span>
    <span
      style={{
        fontSize: '0.82rem',
        fontWeight: 600,
        color: 'var(--text-primary)',
        fontFamily: mono ? "'JetBrains Mono', 'Fira Code', monospace" : undefined,
        textAlign: 'right',
        wordBreak: 'break-all',
      }}
    >
      {value ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
    </span>
  </div>
);

const Card: React.FC<{
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  children: React.ReactNode;
}> = ({ title, icon, accentColor, children }) => (
  <div
    style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-color)',
      borderRadius: 14,
      overflow: 'hidden',
    }}
  >
    {/* Card Header */}
    <div
      style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: `linear-gradient(90deg, ${accentColor}18 0%, transparent 100%)`,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: `${accentColor}22`,
          border: `1px solid ${accentColor}44`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: accentColor,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <h3
        style={{
          fontSize: '0.95rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          margin: 0,
        }}
      >
        {title}
      </h3>
    </div>

    {/* Card Body */}
    <div style={{ padding: '4px 20px 16px' }}>{children}</div>
  </div>
);

/* Collection row */
const CollectionRow: React.FC<{ col: AnsibleCollection; index: number }> = ({ col, index }) => {
  const [namespace, name] = col.name.includes('.') ? col.name.split('.') : ['', col.name];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 14px',
        borderRadius: 8,
        background: index % 2 === 0 ? 'var(--bg-tertiary)' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <ChevronRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', minWidth: 80 }}>
        {namespace}
      </span>
      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
        .{name}
      </span>
      <span
        style={{
          fontSize: '0.72rem',
          fontFamily: "'JetBrains Mono', monospace",
          padding: '2px 8px',
          borderRadius: 6,
          backgroundColor: 'rgba(99,102,241,0.12)',
          color: '#818cf8',
          border: '1px solid rgba(99,102,241,0.25)',
          fontWeight: 600,
        }}
      >
        v{col.version}
      </span>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────────────── */
/* Main Page                                                                    */
/* ──────────────────────────────────────────────────────────────────────────── */

export const SystemInfoPage: React.FC = () => {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [searchCollection, setSearchCollection] = useState('');
  const [performance, setPerformance] = useState<SystemPerformance | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSystemInfo();
      setInfo(data);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message || 'Failed to load system info');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const refreshPerformance = async () => {
      try { setPerformance(await api.getPerformance()); } catch (_) {}
    };
    refreshPerformance();
    const interval = setInterval(refreshPerformance, 3000);
    return () => clearInterval(interval);
  }, [load]);

  const filteredCollections = (info?.collections ?? []).filter((c) =>
    c.name.toLowerCase().includes(searchCollection.toLowerCase())
  );

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Page Header ──────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 28,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 20px rgba(99,102,241,0.35)',
            }}
          >
            <Info size={24} color="#fff" />
          </div>
          <div>
            <h2
              style={{
                fontSize: '1.4rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              System Information
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
              Runtime environment · Tool versions · Installed collections
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastRefresh && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={load}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36 }}
          >
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── Error State ───────────────────────────────────────── */}
      {error && (
        <div
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 10,
            padding: '14px 18px',
            color: '#ef4444',
            fontSize: '0.85rem',
            marginBottom: 24,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* ── Skeleton / Loading ────────────────────────────────── */}
      {loading && !info && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 20,
          }}
        >
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              style={{
                height: 180,
                borderRadius: 14,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          ))}
        </div>
      )}

      {/* ── Main Grid ─────────────────────────────────────────── */}
      {info && (
        <>
          {performance && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 12 }}>
                {[
                  ['CPU', `${performance.cpuPercent}%`, '#f97316'],
                  ['RAM', `${performance.memory.percent}% · ${formatBytes(performance.memory.usedBytes)}`, '#06b6d4'],
                  ['Disk', `${performance.disk.totalBytes ? Math.round((performance.disk.usedBytes / performance.disk.totalBytes) * 100) : 0}% · ${formatBytes(performance.disk.freeBytes)} free`, '#22c55e'],
                  ['Running Tasks', String(performance.runningTasks.length), '#a855f7']
                ].map(([label, value, color]) => (
                  <div key={label} style={{ padding: '14px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 10 }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>{label}</div>
                    <strong style={{ display: 'block', marginTop: 6, color, fontSize: '1.1rem' }}>{value}</strong>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                <Card title="Storage Usage" icon={<HardDrive size={18} />} accentColor="#22c55e">
                  <div style={{ paddingTop: 12 }}>
                    {[
                      { label: 'Templates', data: performance.storage.templates, color: '#22c55e' },
                      { label: 'Workspaces', data: performance.storage.workspaces, color: '#06b6d4' }
                    ].map((item) => {
                      const maxBytes = Math.max(performance.storage.templates.bytes, performance.storage.workspaces.bytes, 1);
                      const width = Math.max(item.data.bytes ? 4 : 0, (item.data.bytes / maxBytes) * 100);
                      return (
                        <div key={item.label} style={{ marginBottom: 16 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.label}</span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 700 }}>{formatBytes(item.data.bytes)} · {item.data.files} files</span>
                          </div>
                          <div style={{ height: 10, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                            <div style={{ width: `${width}%`, height: '100%', borderRadius: 999, background: item.color, transition: 'width 0.4s ease' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 4, marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Disk capacity</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 700 }}>{formatBytes(performance.disk.usedBytes)} used · {formatBytes(performance.disk.freeBytes)} free</span>
                    </div>
                    <div style={{ display: 'flex', height: 12, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                      <div style={{ width: `${performance.disk.totalBytes ? (performance.disk.usedBytes / performance.disk.totalBytes) * 100 : 0}%`, background: '#f59e0b', transition: 'width 0.4s ease' }} />
                      <div style={{ flex: 1, background: '#334155' }} />
                    </div>
                  </div>
                  <InfoRow label="Disk total capacity" value={formatBytes(performance.disk.totalBytes)} />
                  <InfoRow label="Workspace total usage" value={`${formatBytes(performance.storage.workspaces.bytes)} · ${performance.storage.workspaces.files} files`} />
                  <InfoRow label="Node RSS" value={formatBytes(performance.process.rssBytes)} />
                </Card>
                <Card title="Running Tasks" icon={<Activity size={18} />} accentColor="#a855f7">
                  {performance.runningTasks.length === 0 ? <InfoRow label="Status" value="No active tasks" /> : performance.runningTasks.map((task) => (
                    <InfoRow key={task.id} label={task.templateName} value={`${task.id} · ${task.duration}`} mono />
                  ))}
                </Card>
              </div>
            </div>
          )}

          {/* Runtime tools as a compact list */}
          <div style={{ marginBottom: 20, borderTop: '1px solid var(--border-color)' }}>
            <InfoRow label="Ansible" value={<span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><strong style={{ color: '#f97316' }}>{info.ansible.available ? info.ansible.version : 'Not found'}</strong><StatusBadge available={info.ansible.available} /></span>} />
            <InfoRow label="Ansible Python" value={info.ansible.pythonVersion} mono />
            <InfoRow label="Ansible config" value={info.ansible.configFile ?? 'default'} mono />
            <InfoRow label="Terraform" value={<span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><strong style={{ color: '#8b5cf6' }}>{info.terraform.available ? info.terraform.version : 'Not found'}</strong><StatusBadge available={info.terraform.available} /></span>} />
            <InfoRow label="Terraform provider" value="HashiCorp Terraform" />
            <InfoRow label="Node.js" value={info.platform.nodeVersion} mono />
            <InfoRow label="Python 3" value={info.platform.pythonVersion} mono />
            <InfoRow label="Platform" value={`${info.platform.platform} / ${info.platform.arch}`} mono />
            <InfoRow label="Kernel" value={info.platform.kernel || '—'} mono />
            <InfoRow label="Hostname" value={info.platform.hostname} mono />
            <InfoRow label="Process uptime" value={formatUptime(info.platform.uptime)} />
            <InfoRow label="Process memory RSS" value={`${info.platform.memoryUsageMb} MB`} />
            <InfoRow label="Installed collections" value={info.collections.length} />
          </div>

          {/* Collections Table */}
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                background: 'linear-gradient(90deg, rgba(99,102,241,0.08) 0%, transparent 100%)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'rgba(99,102,241,0.15)',
                    border: '1px solid rgba(99,102,241,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#818cf8',
                    flexShrink: 0,
                  }}
                >
                  <Package size={18} />
                </div>
                <div>
                  <h3
                    style={{
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      margin: 0,
                    }}
                  >
                    Ansible Collections
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {info.collections.length} collection{info.collections.length !== 1 ? 's' : ''} installed via ansible-galaxy
                  </p>
                </div>
              </div>

              {/* Search */}
              <div style={{ position: 'relative' }}>
                <Layers
                  size={13}
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  type="text"
                  placeholder="Filter collections…"
                  value={searchCollection}
                  onChange={(e) => setSearchCollection(e.target.value)}
                  className="form-control"
                  style={{ paddingLeft: 30, height: 34, fontSize: '0.8rem', width: 220 }}
                />
              </div>
            </div>

            {/* Collection List */}
            {filteredCollections.length === 0 ? (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem',
                }}
              >
                {info.collections.length === 0
                  ? 'No collections installed. On Linux/Docker, collections from requirements.yml are installed at build time.'
                  : `No collections match "${searchCollection}"`}
              </div>
            ) : (
              <div style={{ padding: '8px 6px' }}>
                {filteredCollections.map((col, i) => (
                  <CollectionRow key={col.name} col={col} index={i} />
                ))}
              </div>
            )}

            {/* Footer tip */}
            <div
              style={{
                padding: '10px 20px',
                borderTop: '1px solid var(--border-color)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Info size={12} />
              To add collections, edit{' '}
              <code
                style={{
                  fontFamily: 'monospace',
                  backgroundColor: 'var(--bg-tertiary)',
                  padding: '1px 5px',
                  borderRadius: 4,
                }}
              >
                backend/ansible/requirements.yml
              </code>{' '}
              and rebuild the Docker image.
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};
