import React, { useState, useEffect } from 'react';
import {
  CalendarClock,
  Plus,
  Trash2,
  PauseCircle,
  PlayCircle,
  X
} from 'lucide-react';
import type { Schedule, TaskTemplate } from '../types';
import { api } from '../services/api';

export const SchedulesPage: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form
  const [templateId, setTemplateId] = useState('');
  const [cronExpr, setCronExpr] = useState('0 2 * * *');
  const [cronHuman, setCronHuman] = useState('Every day at 02:00 AM UTC');

  const loadData = async () => {
    try {
      const [scheds, tmpls] = await Promise.all([
        api.getSchedules(),
        api.getTemplates()
      ]);
      setSchedules(scheds);
      setTemplates(tmpls);
      if (tmpls.length > 0 && !templateId) {
        setTemplateId(tmpls[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleEnable = async (sched: Schedule) => {
    try {
      const updated = await api.updateSchedule(sched.id, { enabled: !sched.enabled });
      setSchedules((prev) => prev.map((s) => (s.id === sched.id ? updated : s)));
    } catch (err) {
      alert(`Update failed: ${err}`);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.createSchedule({
        templateId,
        cron: cronExpr,
        cronHuman,
        enabled: true
      });
      setSchedules((prev) => [...prev, created]);
      setShowAddModal(false);
    } catch (err) {
      alert(`Create failed: ${err}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    try {
      await api.deleteSchedule(id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
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
            Scheduled Cron Tasks
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Automate recurring Ansible playbook executions on precise cron intervals (daily backups, CVE security patching, health audits).
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={16} />
          <span>New Schedule</span>
        </button>
      </div>

      {/* Schedules List */}
      <div className="glass-panel" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 940, borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
              <th style={{ padding: '11px 14px' }}>TASK TEMPLATE</th>
              <th style={{ padding: '11px 14px' }}>STATUS</th>
              <th style={{ padding: '11px 14px' }}>CRON</th>
              <th style={{ padding: '11px 14px' }}>SCHEDULE</th>
              <th style={{ padding: '11px 14px' }}>LAST RUN</th>
              <th style={{ padding: '11px 14px' }}>NEXT RUN (UTC)</th>
              <th style={{ padding: '11px 14px', textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((sched) => (
              <tr key={sched.id} style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                <td style={{ padding: '12px 14px', fontWeight: 700 }}>{sched.templateName || sched.templateId}</td>
                <td style={{ padding: '12px 14px' }}>
                  <span className={`badge ${sched.enabled ? 'badge-success' : 'badge-info'}`}>
                    {sched.enabled ? 'ENABLED' : 'PAUSED'}
                  </span>
                </td>
                <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-primary)', whiteSpace: 'nowrap' }}>{sched.cron}</td>
                <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{sched.cronHuman || 'Custom schedule'}</td>
                <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{sched.lastRun ? new Date(sched.lastRun).toLocaleString() : 'Never'}</td>
                <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                  {sched.nextRun ? new Date(sched.nextRun).toLocaleString(undefined, { timeZone: 'UTC', timeZoneName: 'short' }) : sched.enabled ? 'Calculating...' : 'Paused'}
                </td>
                <td style={{ padding: '8px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleToggleEnable(sched)} title={sched.enabled ? 'Pause schedule' : 'Enable schedule'}>
                      {sched.enabled ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
                      <span>{sched.enabled ? 'Pause' : 'Resume'}</span>
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(sched.id)} style={{ color: '#ef4444' }} title="Delete schedule" aria-label={`Delete schedule for ${sched.templateName}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {schedules.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)' }}>No scheduled tasks yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Schedule Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 500 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                  <CalendarClock size={20} />
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Schedule Automated Task</h3>
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
                <label className="form-label">Target Task Template *</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="form-control"
                  required
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.playbook})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Cron Expression (UTC: minute hour day month weekday) *</label>
                <input
                  type="text"
                  required
                  placeholder="0 2 * * *"
                  value={cronExpr}
                  onChange={(e) => setCronExpr(e.target.value)}
                  className="form-control"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
                <span style={{ display: 'block', marginTop: 6, color: 'var(--text-muted)', fontSize: '0.74rem', lineHeight: 1.5 }}>
                  Examples: <code>0 2 * * *</code> daily at 02:00; <code>30 8 * * 1-5</code> weekdays at 08:30; <code>0 9 * * 1</code> Mondays at 09:00. Times are UTC.
                </span>
              </div>

              <div>
                <label className="form-label">Human-Readable Description</label>
                <input
                  type="text"
                  placeholder="Every day at 02:00 AM UTC"
                  value={cronHuman}
                  onChange={(e) => setCronHuman(e.target.value)}
                  className="form-control"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
