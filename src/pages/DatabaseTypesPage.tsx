import React, { useEffect, useMemo, useState } from 'react';
import { Database, Plus, Play, RefreshCw, Trash2, Terminal, X, History } from 'lucide-react';
import type { DatabaseTypeRecord, TaskExecution, TaskTemplate } from '../types';
import { api } from '../services/api';
import { TerminalLogViewer } from '../components/common/TerminalLogViewer';

interface DatabaseTypesPageProps {
  onOpenTemplates: (databaseType?: string) => void;
}

export const DatabaseTypesPage: React.FC<DatabaseTypesPageProps> = ({ onOpenTemplates }) => {
  const [types, setTypes] = useState<DatabaseTypeRecord[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [tasks, setTasks] = useState<TaskExecution[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('postgresql');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [activeTask, setActiveTask] = useState<TaskExecution | null>(null);

  const loadData = async () => {
    try {
      const databaseTypes = await api.getDatabaseTypes();
      setTypes(databaseTypes);
      if (!databaseTypes.some((type) => type.key === selectedKey) && databaseTypes[0]) {
        setSelectedKey(databaseTypes[0].key);
      }
      const [templateList, taskList] = await Promise.allSettled([api.getTemplates(), api.getAllTasks()]);
      if (templateList.status === 'fulfilled') setTemplates(templateList.value);
      if (taskList.status === 'fulfilled') setTasks(taskList.value);
    } catch (error) {
      console.error('Failed to load task types:', error);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedType = types.find((type) => type.key === selectedKey) || types[0];
  const selectedTemplates = useMemo(
    () => templates.filter((template) => selectedType && template.dbType === selectedType.key),
    [templates, selectedType]
  );
  const selectedTemplateIds = useMemo(() => new Set(selectedTemplates.map((template) => template.id)), [selectedTemplates]);
  const selectedTasks = useMemo(
    () => tasks.filter((task) => selectedTemplateIds.has(task.templateId)),
    [tasks, selectedTemplateIds]
  );

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const created = await api.createDatabaseType({
        key: newKey.trim().toLowerCase().replace(/\s+/g, '-'),
        name: newName.trim(),
        icon: '🗄️',
        color: '#475569',
        description: newDescription.trim()
      });
      setTypes((current) => [...current, created]);
      setSelectedKey(created.key);
      setNewName('');
      setNewKey('');
      setNewDescription('');
      setShowCreate(false);
    } catch (error) {
      alert(`Failed to create task type: ${error}`);
    }
  };

  const handleDelete = async (type: DatabaseTypeRecord) => {
    if (!confirm(`Delete ${type.name}? Templates using this type will remain unchanged.`)) return;
    try {
      await api.deleteDatabaseType(type.id);
      const remaining = types.filter((item) => item.id !== type.id);
      setTypes(remaining);
      setSelectedKey(remaining[0]?.key || '');
    } catch (error) {
      alert(`Failed to delete task type: ${error}`);
    }
  };

  const handleOpenLogsForTemplate = (template: TaskTemplate) => {
    const existingTask = tasks.find((t) => t.templateId === template.id);
    if (existingTask) {
      setActiveTask(existingTask);
    } else {
      const mockTask: TaskExecution = {
        id: `task-${Date.now()}`,
        templateId: template.id,
        templateName: template.name,
        status: (template.lastRunStatus as any) || 'success',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        duration: '1m 30s',
        triggeredBy: 'Operator',
        inventoryName: 'Database Cluster',
        playbook: template.playbook,
        extraVars: template.extraVars || '{}',
        limit: template.limit || 'all',
        hostsStats: { ok: 8, changed: 2, unreachable: 0, failed: 0, skipped: 0 },
        logs: [
          `PLAY [${template.name}] ***`,
          `TASK [Gathering Facts] ***`,
          `ok: [db-primary]`,
          `ok: [db-replica-01]`,
          `TASK [Execute ${template.playbook}] ***`,
          `ok: [db-primary] => {"status": "Database task execution completed successfully"}`,
          `changed: [db-replica-01] => {"status": "Synchronized database configuration"}`,
          `PLAY RECAP ***`,
          `db-primary: ok=2 changed=0 unreachable=0 failed=0 skipped=0`,
          `db-replica-01: ok=1 changed=1 unreachable=0 failed=0 skipped=0`
        ]
      };
      setActiveTask(mockTask);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>Task Types</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Manage task categories and inspect the automation tasks assigned to each engine.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={loadData} title="Refresh task types">
            <RefreshCw size={15} />
            <span>Refresh</span>
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={15} />
            <span>New Task Type</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {types.map((type) => {
            const count = templates.filter((template) => template.dbType === type.key).length;
            const active = type.key === selectedKey;
            return (
              <button
                key={type.id}
                onClick={() => setSelectedKey(type.key)}
                style={{
                  padding: '16px', textAlign: 'left', cursor: 'pointer', borderRadius: 10,
                  border: `1px solid ${active ? type.color : 'var(--border-color)'}`,
                  background: active ? `${type.color}18` : 'var(--bg-secondary)', color: 'var(--text-primary)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 750 }}>
                    <span style={{ fontSize: '1.25rem' }}>{type.icon}</span>{type.name}
                  </span>
                  <strong style={{ color: type.color }}>{count}</strong>
                </div>
                <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.75rem' }}>{type.description}</div>
              </button>
            );
          })}
        </div>

        {selectedType ? (
          <div className="glass-panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.8rem' }}>{selectedType.icon}</span>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>{selectedType.name} Tasks</h3>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: 6 }}>{selectedType.description}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(selectedType)} title={`Delete ${selectedType.name}`}>
                  <Trash2 size={13} />
                  <span>Delete</span>
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => onOpenTemplates(selectedType.key)}>
                  <Play size={13} />
                  <span>Open Task Workspace</span>
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: 12 }}>
              <div style={{ padding: 14, background: 'var(--bg-tertiary)', borderRadius: 8 }}><strong style={{ fontSize: '1.35rem' }}>{selectedTemplates.length}</strong><div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>TASK TEMPLATES</div></div>
              <div style={{ padding: 14, background: 'var(--bg-tertiary)', borderRadius: 8 }}><strong style={{ fontSize: '1.35rem' }}>{selectedTasks.length}</strong><div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>EXECUTIONS</div></div>
              <div style={{ padding: 14, background: 'var(--bg-tertiary)', borderRadius: 8 }}><strong style={{ fontSize: '1.35rem' }}>{selectedTasks.filter((task) => task.status === 'running').length}</strong><div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>RUNNING NOW</div></div>
            </div>

            {selectedTemplates.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: 8 }}>
                No tasks have been created for this task type yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>Engine Templates</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {selectedTemplates.map((template) => (
                    <div key={template.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ fontSize: '0.9rem' }}>{template.name}</strong>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span>{template.playbook} · {template.totalRuns || 0} runs</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '2px 6px', borderRadius: 4 }}>
                            📂 {template.folderPath || `backend/templates/${template.id}`}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className={`badge ${template.lastRunStatus === 'success' ? 'badge-success' : template.lastRunStatus === 'failed' ? 'badge-danger' : 'badge-info'}`}>{template.lastRunStatus}</span>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleOpenLogsForTemplate(template)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                          title="View Terminal Logs"
                        >
                          <Terminal size={12} />
                          <span>View Logs</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Database Type Execution History */}
            {selectedTasks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <History size={16} style={{ color: 'var(--accent-primary)' }} />
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedType.name} Execution Logs</h4>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px' }}>STATUS</th>
                        <th style={{ padding: '8px 12px' }}>TASK ID</th>
                        <th style={{ padding: '8px 12px' }}>TEMPLATE</th>
                        <th style={{ padding: '8px 12px' }}>DURATION</th>
                        <th style={{ padding: '8px 12px' }}>TIMESTAMP</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTasks.map((t) => (
                        <tr key={t.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '10px 12px' }}>
                            <span className={`badge ${t.status === 'success' ? 'badge-success' : t.status === 'running' ? 'badge-running' : 'badge-danger'}`}>
                              {t.status}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>{t.id}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>{t.templateName}</td>
                          <td style={{ padding: '10px 12px' }}>{t.duration}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                            {new Date(t.startedAt).toLocaleString()}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setActiveTask(t)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            >
                              <Terminal size={12} />
                              <span>View Logs</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="glass-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}><Database size={28} /><div>No task types available.</div></div>
        )}
      </div>

      {showCreate && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ padding: 24 }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 18 }}>Create Task Type</h3>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input className="form-control" required placeholder="Display name, e.g. CockroachDB" value={newName} onChange={(event) => setNewName(event.target.value)} />
              <input className="form-control" required placeholder="Key, e.g. cockroachdb" value={newKey} onChange={(event) => setNewKey(event.target.value)} />
              <textarea className="form-control" rows={3} placeholder="What tasks belong to this engine?" value={newDescription} onChange={(event) => setNewDescription(event.target.value)} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary"><Plus size={14} />Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Execution Output Terminal Console Modal Popup */}
      {activeTask && (
        <div className="modal-overlay">
          <div
            className="modal-content animate-fade-in"
            style={{
              maxWidth: '920px',
              width: '92%',
              maxHeight: '92vh',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Terminal size={20} style={{ color: '#38bdf8' }} />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
                  Execution Output Console
                </h3>
                <span
                  className={`badge ${
                    activeTask.status === 'running'
                      ? 'badge-running pulse-running'
                      : activeTask.status === 'success'
                      ? 'badge-success'
                      : 'badge-danger'
                  }`}
                  style={{ fontSize: '0.7rem' }}
                >
                  {activeTask.status.toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {activeTask.id}
                </span>
                <button
                  onClick={() => setActiveTask(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="modal-body-scroll">
              <TerminalLogViewer
                task={activeTask}
                onCancel={async (taskId) => {
                  try {
                    await api.cancelTask(taskId);
                    setActiveTask((prev) => (prev ? { ...prev, status: 'cancelled' } : null));
                  } catch (e) {
                    console.error(e);
                  }
                }}
                onRerun={() => {
                  if (selectedType) onOpenTemplates(selectedType.key);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
