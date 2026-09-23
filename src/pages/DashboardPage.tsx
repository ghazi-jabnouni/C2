import React, { useState, useEffect } from 'react';
import {
  Layers,
  Activity,
  CheckCircle2,
  Clock,
  CalendarClock,
  Play,
  ArrowUpRight,
  Terminal,
  Zap,
  RefreshCw
} from 'lucide-react';
import type { DashboardStats, TaskTemplate, TaskExecution } from '../types';
import { api } from '../services/api';

interface DashboardPageProps {
  onNavigate: (tab: string, extra?: any) => void;
  onLaunchTemplate: (template: TaskTemplate) => void;
  onInspectTask: (task: TaskExecution) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigate,
  onLaunchTemplate,
  onInspectTask
}) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsData, tmpls] = await Promise.all([
        api.getStats(),
        api.getTemplates()
      ]);
      setStats(statsData);
      setTemplates(tmpls);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalRuns = stats?.totalTasksRun || 0;
  const successCount = stats?.successfulTasks || 0;
  const successRate = totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : 100;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Top Banner / Welcome */}
      <div
        className="glass-panel"
        style={{
          padding: '24px 28px',
          background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(124, 58, 237, 0.08) 100%)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className="badge badge-success">Cluster Online</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Region: us-east-1 / eu-west-1</span>
          </div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Ansible Automation Orchestrator
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>
            Manage repositories, execute playbooks across host clusters, schedule cron tasks, and approve client pipelines.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={loadData}>
            <RefreshCw size={14} className={loading ? 'spin-slow' : ''} />
            <span>Refresh</span>
          </button>
          <button className="btn btn-primary" onClick={() => onNavigate('templates')}>
            <Layers size={14} />
            <span>Manage Templates</span>
          </button>
        </div>
      </div>

      {/* Pending Approvals Callout (If any) */}
      {stats && stats.pendingApprovalsCount > 0 && (
        <div
          className="glass-panel"
          style={{
            padding: '16px 20px',
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            borderColor: 'rgba(245, 158, 11, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#d97706'
              }}
            >
              <Clock size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                {stats.pendingApprovalsCount} Client Execution Request{stats.pendingApprovalsCount > 1 ? 's' : ''} Pending Review
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                External CI/CD or API services requested automated playbook executions requiring operator approval.
              </div>
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ backgroundColor: '#d97706', borderColor: '#d97706' }}
            onClick={() => onNavigate('pending-requests')}
          >
            <span>Review Queue</span>
            <ArrowUpRight size={14} />
          </button>
        </div>
      )}

      {/* KPI Metrics Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16
        }}
      >
        {/* Total Templates */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              TASK TEMPLATES
            </span>
            <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
              <Layers size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, margin: '8px 0 4px', color: 'var(--text-primary)' }}>
            {stats?.totalTemplates || templates.length}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Active playbook runners</span>
        </div>

        {/* Success Rate */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              SUCCESS RATE
            </span>
            <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, margin: '8px 0 4px', color: '#10b981' }}>
            {successRate}%
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {stats?.successfulTasks || 0} passed / {stats?.totalTasksRun || 0} runs
          </span>
        </div>

        {/* Running Jobs */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              ACTIVE RUNS
            </span>
            <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(168, 85, 247, 0.12)', color: '#a855f7' }}>
              <Activity size={18} className={(stats?.runningTasks || 0) > 0 ? 'pulse-running' : ''} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, margin: '8px 0 4px', color: 'var(--text-primary)' }}>
            {stats?.runningTasks || 0}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Live worker threads</span>
        </div>

        {/* Active Schedules */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              SCHEDULED CRONS
            </span>
            <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
              <CalendarClock size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, margin: '8px 0 4px', color: 'var(--text-primary)' }}>
            {stats?.activeSchedulesCount || 2}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Automated recurring tasks</span>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 24 }}>
        {/* Quick Launch Templates */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={18} style={{ color: 'var(--accent-primary)' }} />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Quick Launch Templates</h3>
            </div>
            <button
              onClick={() => onNavigate('templates')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-primary)',
                cursor: 'pointer',
                fontSize: '0.825rem',
                fontWeight: 600
              }}
            >
              View All ({templates.length}) →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {templates.slice(0, 5).map((tmpl) => {
              const getDbIcon = (type?: string) => {
                switch (type) {
                  case 'postgresql': return '🐘 Postgres';
                  case 'mssql': return '🪟 MSSQL';
                  case 'oracle': return '🔴 Oracle';
                  case 'mysql': return '🐬 MySQL';
                  case 'redis': return '⚡ Redis';
                  case 'mongodb': return '🍃 Mongo';
                  default: return '⚙️ Infra';
                }
              };
              return (
                <div
                  key={tmpl.id}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 10,
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4, backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-primary)' }}>
                        {getDbIcon(tmpl.dbType)}
                      </span>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {tmpl.name}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: '0.725rem',
                        color: 'var(--text-muted)',
                        marginTop: 3,
                        fontFamily: 'var(--font-mono)'
                      }}
                    >
                      {tmpl.playbook}
                    </div>
                  </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className={`badge ${
                      tmpl.lastRunStatus === 'success'
                        ? 'badge-success'
                        : tmpl.lastRunStatus === 'running'
                        ? 'badge-running'
                        : tmpl.lastRunStatus === 'failed'
                        ? 'badge-danger'
                        : 'badge-info'
                    }`}
                  >
                    {tmpl.lastRunStatus}
                  </span>

                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => onLaunchTemplate(tmpl)}
                    title="Run Playbook Now"
                  >
                    <Play size={12} fill="white" />
                    <span>Run</span>
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        </div>

        {/* Recent Executions History Table */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Terminal size={18} style={{ color: '#38bdf8' }} />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Recent Executions</h3>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Live updates</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stats?.recentTasks && stats.recentTasks.length > 0 ? (
              stats.recentTasks.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  onClick={() => onInspectTask(task)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    gap: 12
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor:
                          task.status === 'success'
                            ? '#10b981'
                            : task.status === 'running'
                            ? '#a855f7'
                            : '#ef4444'
                      }}
                      className={task.status === 'running' ? 'pulse-running' : ''}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        {task.templateName}
                      </div>
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                        {new Date(task.startedAt).toLocaleTimeString()} • {task.duration}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      className={`badge ${
                        task.status === 'success'
                          ? 'badge-success'
                          : task.status === 'running'
                          ? 'badge-running'
                          : 'badge-danger'
                      }`}
                    >
                      {task.status}
                    </span>
                    <ArrowUpRight size={14} style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No task executions recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
