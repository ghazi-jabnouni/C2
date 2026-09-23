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

      {/* Schedules List Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20 }}>
        {schedules.map((sched) => (
          <div key={sched.id} className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    backgroundColor: sched.enabled ? 'rgba(16, 185, 129, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                    color: sched.enabled ? '#10b981' : '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <CalendarClock size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {sched.templateName}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                    <span className={`badge ${sched.enabled ? 'badge-success' : 'badge-info'}`} style={{ fontSize: '0.65rem' }}>
                      {sched.enabled ? 'ENABLED' : 'PAUSED'}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleToggleEnable(sched)}
                  title={sched.enabled ? 'Pause schedule' : 'Enable schedule'}
                >
                  {sched.enabled ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
                  <span>{sched.enabled ? 'Pause' : 'Resume'}</span>
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleDelete(sched.id)}
                  style={{ color: '#ef4444' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Cron Expression Card */}
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                backgroundColor: 'var(--bg-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', display: 'block' }}>
                  CRON SPECIFICATION
                </span>
                <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-primary)', fontSize: '0.9rem' }}>
                  {sched.cron}
                </code>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {sched.cronHuman}
              </span>
            </div>

            {/* Next run metadata */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.775rem', color: 'var(--text-muted)' }}>
              <span>
                Last Run: <strong>{sched.lastRun ? new Date(sched.lastRun).toLocaleString() : 'Never'}</strong>
              </span>
              <span>
                Next Run: <strong style={{ color: 'var(--text-primary)' }}>{new Date(sched.nextRun || Date.now()).toLocaleString()}</strong>
              </span>
            </div>
          </div>
        ))}
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
                <label className="form-label">Cron Expression (Minute Hour DOM Month DOW) *</label>
                <input
                  type="text"
                  required
                  placeholder="0 2 * * *"
                  value={cronExpr}
                  onChange={(e) => setCronExpr(e.target.value)}
                  className="form-control"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
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
