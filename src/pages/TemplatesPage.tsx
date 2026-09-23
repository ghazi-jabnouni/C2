import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  Layers,
  Plus,
  Play,
  History,
  Terminal,
  FolderGit2,
  Server,
  Sliders,
  Search,
  X,
  Code2,
  Database,
  Trash2,
  Edit2
} from 'lucide-react';
import type {
  TaskTemplate,
  Repository,
  Inventory,
  Credential,
  Environment,
  TaskExecution,
  DatabaseType,
  DatabaseTypeRecord
} from '../types';
import { api } from '../services/api';
import { TerminalLogViewer } from '../components/common/TerminalLogViewer';

interface TemplatesPageProps {
  initialActiveTaskId?: string | null;
  initialDatabaseType?: string;
}

export const TemplatesPage: React.FC<TemplatesPageProps> = ({ initialActiveTaskId, initialDatabaseType }) => {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  void credentials;
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [tasks, setTasks] = useState<TaskExecution[]>([]);
  const [databaseTypes, setDatabaseTypes] = useState<DatabaseTypeRecord[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDbType, setSelectedDbType] = useState<string>(initialDatabaseType || 'all');
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [activeTask, setActiveTask] = useState<TaskExecution | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [templateToLaunch, setTemplateToLaunch] = useState<TaskTemplate | null>(null);

  // Launch modal inputs
  const [launchExtraVars, setLaunchExtraVars] = useState('{}');
  const [launchLimit, setLaunchLimit] = useState('');

  // New template form inputs
  const [formType, setFormType] = useState<'ansible' | 'terraform'>('ansible');
  const [formProvider, setFormProvider] = useState<string>('aws');
  const [formTfAction, setFormTfAction] = useState<'plan' | 'apply' | 'destroy'>('apply');
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formDbType, setFormDbType] = useState<DatabaseType>('postgresql');
  const [formRepoId, setFormRepoId] = useState('');
  const [formPlaybook, setFormPlaybook] = useState('');
  const [formInvId, setFormInvId] = useState('');
  const [formEnvId, setFormEnvId] = useState('');
  const [formExtraVars, setFormExtraVars] = useState('{\n  "version": "v1.0.0"\n}');
  const [formLimit, setFormLimit] = useState('all');
  const [formTags, setFormTags] = useState('');

  const handleProviderChange = (prov: string) => {
    setFormProvider(prov);
    if (prov === 'aws') {
      setFormExtraVars('{\n  "aws_region": "us-east-1",\n  "instance_type": "t3.medium",\n  "db_engine_version": "15.3",\n  "allocated_storage": 50\n}');
    } else if (prov === 'azure') {
      setFormExtraVars('{\n  "location": "East US",\n  "vm_size": "Standard_DS2_v2",\n  "sku_name": "GP_Gen5_2"\n}');
    } else if (prov === 'gcp') {
      setFormExtraVars('{\n  "project_id": "automaton-prod",\n  "region": "us-central1",\n  "machine_type": "e2-standard-4"\n}');
    } else if (prov === 'kubernetes') {
      setFormExtraVars('{\n  "namespace": "production",\n  "replica_count": 3\n}');
    } else {
      setFormExtraVars('{\n  "environment": "production",\n  "version": "1.0.0"\n}');
    }
  };

  const defaultDbCategories: { id: string; label: string; icon: string; color: string; bg: string }[] = [
    { id: 'all', label: 'All Engines', icon: '🗄️', color: 'var(--text-primary)', bg: 'var(--bg-tertiary)' },
    { id: 'postgresql', label: 'PostgreSQL', icon: '🐘', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
    { id: 'mssql', label: 'Microsoft SQL Server', icon: '🪟', color: '#0284c7', bg: 'rgba(2, 132, 199, 0.12)' },
    { id: 'oracle', label: 'Oracle Database', icon: '🔴', color: '#dc2626', bg: 'rgba(220, 38, 38, 0.12)' },
    { id: 'mysql', label: 'MySQL / MariaDB', icon: '🐬', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
    { id: 'redis', label: 'Redis Cache', icon: '⚡', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },
    { id: 'mongodb', label: 'MongoDB', icon: '🍃', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
    { id: 'infrastructure', label: 'System & Infra', icon: '⚙️', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' }
  ];
  const dbCategories = databaseTypes.length > 0
    ? [
        defaultDbCategories[0],
        ...databaseTypes.map((type) => ({
          id: type.key,
          label: type.name,
          icon: type.icon,
          color: type.color,
          bg: `${type.color}1f`
        }))
      ]
    : defaultDbCategories;
    const templateDbOptions = databaseTypes.length > 0
      ? databaseTypes.map((type) => ({ key: type.key, name: type.name, icon: type.icon }))
      : defaultDbCategories.slice(1).map((type) => ({ key: type.id, name: type.label, icon: type.icon }));

  const loadData = async () => {
    try {
      const loadedDatabaseTypes = await api.getDatabaseTypes();
      setDatabaseTypes(loadedDatabaseTypes);

      // Repositories are still loaded for display purposes (existing templates may reference them)
      const repos = await api.getRepositories();
      setRepositories(repos);

      const results = await Promise.allSettled([
        api.getTemplates(),
        api.getInventories(),
        api.getCredentials(),
        api.getEnvironments(),
        api.getAllTasks()
      ]);
      const [templatesResult, inventoriesResult, credentialsResult, environmentsResult, tasksResult] = results;
      const tmpls = templatesResult.status === 'fulfilled' ? templatesResult.value : [];
      const invs = inventoriesResult.status === 'fulfilled' ? inventoriesResult.value : [];
      const creds = credentialsResult.status === 'fulfilled' ? credentialsResult.value : [];
      const envs = environmentsResult.status === 'fulfilled' ? environmentsResult.value : [];
      let allTasks = tasksResult.status === 'fulfilled' ? tasksResult.value : [];
      
      // Add mock task history if no real tasks exist (for demonstration)
      if (allTasks.length === 0 && tmpls.length > 0) {
        allTasks = tmpls.slice(0, 3).flatMap((tmpl, idx) => [
          {
            id: `task-mock-${tmpl.id}-1`,
            templateId: tmpl.id,
            templateName: tmpl.name,
            type: tmpl.type || 'ansible',
            status: 'success' as const,
            startedAt: new Date(Date.now() - (idx + 1) * 86400000).toISOString(),
            finishedAt: new Date(Date.now() - (idx + 1) * 86400000 + 120000).toISOString(),
            duration: '2m 15s',
            triggeredBy: 'admin',
            inventoryName: invs.find(i => i.id === tmpl.inventoryId)?.name || 'Production Servers',
            playbook: tmpl.playbook,
            extraVars: tmpl.extraVars,
            limit: tmpl.limit,
            hostsStats: { ok: 10 + idx * 2, changed: 5 + idx, unreachable: 0, failed: 0, skipped: 1 },
            logs: [
              'TASK [Retrieve Playbook from Git Repository] ***',
              `ok: [localhost] => Playbook '${tmpl.playbook}' successfully retrieved from Git repository applied to template.`,
              'PLAY [all] ***',
              'TASK [Gathering Facts] ***',
              'ok: [server-01]',
              'ok: [server-02]',
              'PLAY RECAP ***'
            ]
          },
          {
            id: `task-mock-${tmpl.id}-2`,
            templateId: tmpl.id,
            templateName: tmpl.name,
            type: tmpl.type || 'ansible',
            status: idx === 1 ? 'failed' : 'success' as const,
            startedAt: new Date(Date.now() - (idx + 1) * 172800000).toISOString(),
            finishedAt: new Date(Date.now() - (idx + 1) * 172800000 + 90000).toISOString(),
            duration: '1m 30s',
            triggeredBy: 'operator',
            inventoryName: invs.find(i => i.id === tmpl.inventoryId)?.name || 'Production Servers',
            playbook: tmpl.playbook,
            extraVars: tmpl.extraVars,
            limit: tmpl.limit,
            hostsStats: idx === 1 
              ? { ok: 5, changed: 2, unreachable: 1, failed: 2, skipped: 0 }
              : { ok: 8, changed: 4, unreachable: 0, failed: 0, skipped: 1 },
            logs: idx === 1 
              ? [
                  'TASK [Retrieve Playbook from Git Repository] ***',
                  `ok: [localhost] => Playbook '${tmpl.playbook}' retrieved from Git repository.`,
                  'PLAY [all] ***',
                  'TASK [Deploy] ***',
                  'fatal: [server-03]: FAILED!'
                ]
              : [
                  'TASK [Retrieve Playbook from Git Repository] ***',
                  `ok: [localhost] => Playbook '${tmpl.playbook}' retrieved from Git repository.`,
                  'PLAY [all] ***',
                  'TASK [Configure] ***',
                  'ok: [server-01]',
                  'PLAY RECAP ***'
                ]
          }
        ]);
      }
      
      setTemplates(tmpls);
      setInventories(invs);
      setCredentials(creds);
      setEnvironments(envs);
      setTasks(allTasks);

      // If initial active task provided, focus it
      if (initialActiveTaskId) {
        try {
          const taskData = await api.getTask(initialActiveTaskId);
          setActiveTask(taskData);
          const tTmpl = tmpls.find((x) => x.id === taskData.templateId);
          if (tTmpl) setSelectedTemplate(tTmpl);
        } catch (e) {
          console.error('Failed to load initial task:', e);
        }
      } else if (tmpls.length > 0 && !selectedTemplate) {
        setSelectedTemplate(tmpls[0]);
      }
    } catch (err) {
      console.error('Error loading template dependencies:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When database type changes in new template form, auto-fill standard extraVars template
  const handleDbTypeChange = (db: DatabaseType) => {
    setFormDbType(db);
    if (db === 'postgresql') {
      setFormExtraVars('{\n  "backup_type": "full",\n  "compression": "zstd",\n  "verify_checksum": true\n}');
    } else if (db === 'mssql') {
      setFormExtraVars('{\n  "ag_name": "AG_PROD",\n  "failover_type": "planned",\n  "online_rebuild": true\n}');
    } else if (db === 'oracle') {
      setFormExtraVars('{\n  "channels": 4,\n  "backup_type": "full_database",\n  "max_allowed_lag_seconds": 30\n}');
    } else if (db === 'mysql') {
      setFormExtraVars('{\n  "parallel": 4,\n  "compress": "lz4",\n  "stream": "xbstream"\n}');
    } else if (db === 'redis') {
      setFormExtraVars('{\n  "max_memory_policy": "volatile-lru",\n  "save_snapshot": true\n}');
    } else if (db === 'mongodb') {
      setFormExtraVars('{\n  "gzip": true,\n  "oplog": true,\n  "dump_target": "s3"\n}');
    } else {
      setFormExtraVars('{\n  "version": "v1.0.0"\n}');
    }
  };

  const handleOpenCreateModal = async () => {
    try {
      const latestRepositories = await api.getRepositories();
      setRepositories(latestRepositories);
      const firstRepo = latestRepositories[0];
      setFormRepoId(firstRepo ? firstRepo.id : '');
      setFormPlaybook(firstRepo?.playbooks?.[0] || '');
    } catch (error) {
      console.error('Failed to load repositories for template form:', error);
    }
    setEditingTemplateId(null);
    setFormType('ansible');
    setFormProvider('aws');
    setFormTfAction('apply');
    setFormName('');
    setFormDesc('');
    setFormDbType((databaseTypes[0]?.key || 'postgresql') as DatabaseType);
    setFormInvId(inventories[0]?.id || '');
    setFormEnvId(environments[0]?.id || '');
    setFormExtraVars('{\n  "backup_type": "full",\n  "compression": "zstd",\n  "verify_checksum": true\n}');
    setFormLimit('all');
    setFormTags('');
    setShowCreateModal(true);
  };

  const handleOpenEditModal = async (tmpl: TaskTemplate) => {
    try {
      const latestRepositories = await api.getRepositories();
      setRepositories(latestRepositories);
    } catch (error) {
      console.error('Failed to load repositories for template form:', error);
    }
    setEditingTemplateId(tmpl.id);
    setFormType(tmpl.type || 'ansible');
    setFormProvider(tmpl.provider || 'aws');
    setFormTfAction(tmpl.terraformAction || 'apply');
    setFormName(tmpl.name);
    setFormDesc(tmpl.description || '');
    setFormDbType((tmpl.dbType || 'postgresql') as DatabaseType);
    setFormRepoId(tmpl.repositoryId || '');
    setFormPlaybook(tmpl.playbook || '');
    setFormInvId(tmpl.inventoryId || '');
    setFormEnvId(tmpl.environmentId || '');
    setFormExtraVars(tmpl.extraVars || '{}');
    setFormLimit(tmpl.limit || 'all');
    setFormTags(tmpl.tags || '');
    setShowCreateModal(true);
  };

  const handleDeleteTemplate = async (tmplId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      await api.deleteTemplate(tmplId);
      setTemplates((prev) => prev.filter((t) => t.id !== tmplId));
      if (selectedTemplate?.id === tmplId) {
        setSelectedTemplate(null);
      }
    } catch (err) {
      alert(`Failed to delete template: ${err}`);
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: formName,
        type: formType,
        provider: formType === 'terraform' ? formProvider : undefined,
        terraformAction: formType === 'terraform' ? formTfAction : undefined,
        description: formDesc,
        dbType: formDbType,
        repositoryId: formRepoId,
        playbook: formPlaybook,
        inventoryId: formInvId,
        environmentId: formEnvId || null,
        extraVars: formExtraVars,
        limit: formLimit,
        tags: formTags,
        allowCliArgs: true
      };
      
      if (editingTemplateId) {
        const updated = await api.updateTemplate(editingTemplateId, payload);
        setTemplates((prev) => prev.map((t) => t.id === editingTemplateId ? updated : t));
        if (selectedTemplate?.id === editingTemplateId) {
          setSelectedTemplate(updated);
        }
      } else {
        const created = await api.createTemplate(payload);
        setTemplates((prev) => [...prev, created]);
        setSelectedTemplate(created);
      }
      setShowCreateModal(false);
    } catch (err) {
      alert(`Failed to save template: ${err}`);
    }
  };

  const handleOpenLaunchModal = (tmpl: TaskTemplate) => {
    setTemplateToLaunch(tmpl);
    setLaunchExtraVars(tmpl.extraVars || '{}');
    setLaunchLimit(tmpl.limit || 'all');
    setShowLaunchModal(true);
  };

  const handleLaunchExecution = async () => {
    if (!templateToLaunch) return;
    try {
      const runningTask = await api.runTemplate(templateToLaunch.id, {
        extraVars: launchExtraVars,
        limit: launchLimit,
        triggeredBy: 'Operator (Web UI)'
      });
      setShowLaunchModal(false);
      setActiveTask(runningTask);
      setSelectedTemplate(templateToLaunch);
      // Refresh all tasks to show new execution in history
      const allTasks = await api.getAllTasks();
      setTasks(allTasks);
      // Also update template stats
      const updatedTemplates = await api.getTemplates();
      setTemplates(updatedTemplates);
    } catch (err) {
      alert(`Launch error: ${err}`);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    try {
      const res = await api.cancelTask(taskId);
      setActiveTask(res.task);
      loadData();
    } catch (err) {
      alert(`Cancel error: ${err}`);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task record?')) return;
    try {
      await api.deleteTask(taskId);
      if (activeTask?.id === taskId) {
        setActiveTask(null);
      }
      loadData();
    } catch (err) {
      alert(`Delete task error: ${err}`);
    }
  };


  const getDbBadge = (dbType?: DatabaseType) => {
    switch (dbType) {
      case 'postgresql':
        return { label: 'PostgreSQL', icon: '🐘', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.3)' };
      case 'mssql':
        return { label: 'MSSQL', icon: '🪟', color: '#0284c7', bg: 'rgba(2, 132, 199, 0.15)', border: 'rgba(2, 132, 199, 0.3)' };
      case 'oracle':
        return { label: 'Oracle', icon: '🔴', color: '#dc2626', bg: 'rgba(220, 38, 38, 0.15)', border: 'rgba(220, 38, 38, 0.3)' };
      case 'mysql':
        return { label: 'MySQL', icon: '🐬', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)' };
      case 'redis':
        return { label: 'Redis', icon: '⚡', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)' };
      case 'mongodb':
        return { label: 'MongoDB', icon: '🍃', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)' };
      default:
        return { label: 'System', icon: '⚙️', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', border: 'rgba(139, 92, 246, 0.3)' };
    }
  };

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.playbook.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDb = selectedDbType === 'all' || t.dbType === selectedDbType;
    return matchesSearch && matchesDb;
  });


  const templateHistoryTasks = selectedTemplate
    ? tasks.filter((t) => t.templateId === selectedTemplate.id)
    : [];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Database & Task Templates
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Automate database operations across MSSQL, Oracle, MySQL, PostgreSQL, Redis, MongoDB, and Core Infrastructure.
          </p>
        </div>

        <button className="btn btn-primary" onClick={handleOpenCreateModal}>
          <Plus size={16} />
          <span>New Task Template</span>
        </button>
      </div>

      {/* Database Engine Division / Filter Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 4,
          borderBottom: '1px solid var(--border-color)'
        }}
      >
        {dbCategories.map((cat) => {
          const isActive = selectedDbType === cat.id;
          const count = cat.id === 'all'
            ? templates.length
            : templates.filter((t) => t.dbType === cat.id).length;

          return (
            <button
              key={cat.id}
              onClick={() => setSelectedDbType(cat.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 8,
                backgroundColor: isActive ? cat.bg : 'var(--bg-secondary)',
                border: `1px solid ${isActive ? cat.color : 'var(--border-color)'}`,
                color: isActive ? cat.color : 'var(--text-secondary)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.825rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  borderRadius: 999,
                  backgroundColor: isActive ? 'rgba(0,0,0,0.1)' : 'var(--bg-tertiary)',
                  color: 'inherit',
                  fontWeight: 700
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Grid: Template List + Details / Console */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 420px) 1fr', gap: 24 }}>
        {/* Left Column: Template Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Search bar */}
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search templates or playbooks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-control"
              style={{ paddingLeft: 36, height: 38 }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '760px', overflowY: 'auto' }}>
            {filteredTemplates.length === 0 ? (
              <div className="glass-panel" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                No templates found in this database category.
              </div>
            ) : (
              filteredTemplates.map((tmpl) => {
                const isSelected = selectedTemplate?.id === tmpl.id;
                const inv = inventories.find((i) => i.id === tmpl.inventoryId);
                const dbBadge = getDbBadge(tmpl.dbType);

                return (
                  <div
                    key={tmpl.id}
                    onClick={() => setSelectedTemplate(tmpl)}
                    className="glass-panel"
                    style={{
                      padding: '16px 18px',
                      cursor: 'pointer',
                      borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-color)',
                      backgroundColor: isSelected ? 'var(--accent-primary-light)' : 'var(--bg-secondary)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {/* Automation Engine Type Pill */}
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: 6,
                            backgroundColor: tmpl.type === 'terraform' ? 'rgba(147, 51, 234, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: tmpl.type === 'terraform' ? '#a855f7' : '#ef4444',
                            border: `1px solid ${tmpl.type === 'terraform' ? 'rgba(147, 51, 234, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <span>{tmpl.type === 'terraform' ? '🏗️ Terraform' : '📜 Ansible'}</span>
                        </span>

                        {/* Database Type Pill */}
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 6,
                            backgroundColor: dbBadge.bg,
                            color: dbBadge.color,
                            border: `1px solid ${dbBadge.border}`,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <span>{dbBadge.icon}</span>
                          <span>{dbBadge.label}</span>
                        </span>

                        <span
                          className={`badge ${
                            tmpl.lastRunStatus === 'success'
                              ? 'badge-success'
                              : tmpl.lastRunStatus === 'running'
                              ? 'badge-running pulse-running'
                              : tmpl.lastRunStatus === 'failed'
                              ? 'badge-danger'
                              : 'badge-info'
                          }`}
                          style={{ fontSize: '0.65rem' }}
                        >
                          {tmpl.lastRunStatus}
                        </span>
                      </div>

                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {tmpl.totalRuns || 0} runs
                      </span>
                    </div>

                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', marginTop: 8 }}>
                      {tmpl.name}
                    </div>

                    <p
                      style={{
                        fontSize: '0.785rem',
                        color: 'var(--text-secondary)',
                        margin: '6px 0 10px',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {tmpl.description || 'No description provided.'}
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FolderGit2 size={13} style={{ color: 'var(--accent-primary)' }} />
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{tmpl.playbook}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Server size={13} />
                        <span>{inv?.name || 'Default Hosts'}</span>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 12,
                        paddingTop: 10,
                        borderTop: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                        Target: <strong style={{ color: 'var(--text-primary)' }}>{tmpl.limit || 'all'}</strong>
                      </span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTemplate(tmpl);
                            const tmplTasks = tasks.filter((t) => t.templateId === tmpl.id);
                            if (tmplTasks.length > 0) {
                              setActiveTask(tmplTasks[0]);
                            } else {
                              const mockTask: TaskExecution = {
                                id: `task-${Date.now()}`,
                                templateId: tmpl.id,
                                templateName: tmpl.name,
                                status: 'success',
                                startedAt: new Date().toISOString(),
                                finishedAt: new Date().toISOString(),
                                duration: '1m 20s',
                                triggeredBy: 'Operator',
                                inventoryName: inv?.name || 'Production Servers',
                                playbook: tmpl.playbook,
                                extraVars: tmpl.extraVars,
                                limit: tmpl.limit,
                                hostsStats: { ok: 8, changed: 2, unreachable: 0, failed: 0, skipped: 0 },
                                logs: [
                                  `TASK [Retrieve Playbook from Git Repository] ***`,
                                  `ok: [localhost] => Playbook '${tmpl.playbook}' successfully retrieved from Git repository applied to template '${tmpl.name}'.`,
                                  `PLAY [${tmpl.name}] ***`,
                                  `TASK [Gathering Facts] ***`,
                                  `ok: [node-01]`,
                                  `ok: [node-02]`,
                                  `TASK [Execute ${tmpl.playbook}] ***`,
                                  `changed: [node-01] => {"msg": "Playbook completed successfully"}`,
                                  `ok: [node-02]`,
                                  `PLAY RECAP ***`,
                                  `node-01: ok=3 changed=1 unreachable=0 failed=0 skipped=0`,
                                  `node-02: ok=3 changed=0 unreachable=0 failed=0 skipped=0`
                                ]
                              };
                              setActiveTask(mockTask);
                            }
                          }}
                          title="View Terminal Execution Output"
                        >
                          <Terminal size={12} />
                          <span>View Logs</span>
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '6px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditModal(tmpl);
                          }}
                          title="Edit Template"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '6px', color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTemplate(tmpl.id);
                          }}
                          title="Delete Template"
                        >
                          <Trash2 size={12} />
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenLaunchModal(tmpl);
                          }}
                        >
                          <Play size={12} fill="white" />
                          <span>Run</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Template Inspector & Live Console / History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {selectedTemplate ? (
            <>
              {/* Dedicated Workspace Folder & Files Card */}
              <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FolderGit2 size={20} style={{ color: 'var(--accent-primary)' }} />
                    <div>
                      <h4 style={{ fontSize: '1rem', fontWeight: 800 }}>
                        Dedicated Template Workspace Directory
                      </h4>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                        {selectedTemplate.folderPath || `backend/templates/${selectedTemplate.id}-${selectedTemplate.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                      </div>
                    </div>
                  </div>
                  <span className="badge badge-info" style={{ fontSize: '0.725rem' }}>
                    ISOLATED WORKSPACE
                  </span>
                </div>

                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  This template runs from its own dedicated directory on disk containing the playbook file, engine inventory YAML, extra variables, and manifest config.
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {(selectedTemplate.folderFiles || ['playbook.yml', 'inventory.yml', 'vars.yml', 'env.json', 'template.json']).map((file) => (
                    <div
                      key={file}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        fontSize: '0.775rem',
                        fontFamily: 'var(--font-mono)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <Code2 size={13} style={{ color: '#38bdf8' }} />
                      <span>{file}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Execution History Table for Selected Template */}
              <div className="glass-panel" style={{ padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <History size={17} style={{ color: 'var(--accent-primary)' }} />
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Execution History ({templateHistoryTasks.length})</h4>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px' }}>STATUS</th>
                        <th style={{ padding: '8px 12px' }}>TASK ID</th>
                        <th style={{ padding: '8px 12px' }}>TRIGGERED BY</th>
                        <th style={{ padding: '8px 12px' }}>DURATION</th>
                        <th style={{ padding: '8px 12px' }}>HOST STATS</th>
                        <th style={{ padding: '8px 12px' }}>TIMESTAMP</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {templateHistoryTasks.map((t) => (
                        <tr
                          key={t.id}
                          style={{
                            borderBottom: '1px solid var(--border-color)',
                            backgroundColor: activeTask?.id === t.id ? 'var(--accent-primary-light)' : 'transparent'
                          }}
                        >
                          <td style={{ padding: '10px 12px' }}>
                            <span
                              className={`badge ${
                                t.status === 'success'
                                  ? 'badge-success'
                                  : t.status === 'running'
                                  ? 'badge-running'
                                  : 'badge-danger'
                              }`}
                            >
                              {t.status}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>{t.id}</td>
                          <td style={{ padding: '10px 12px' }}>{t.triggeredBy}</td>
                          <td style={{ padding: '10px 12px' }}>{t.duration}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>{t.hostsStats.ok} OK</span>
                              <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>{t.hostsStats.changed} CH</span>
                              <span className="badge badge-failed" style={{ fontSize: '0.7rem' }}>{t.hostsStats.failed} FL</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                            {new Date(t.startedAt).toLocaleString()}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setActiveTask(t)}
                              >
                                <Terminal size={12} />
                                <span>View Logs</span>
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}
                                onClick={() => handleDeleteTask(t.id)}
                                title="Delete Task Record"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Execution Output Console Modal Popup */}
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
                    {/* Sticky header — always visible even when content scrolls */}
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

                    {/* Scrollable terminal body */}
                    <div className="modal-body-scroll">
                      <TerminalLogViewer
                        task={activeTask}
                        onCancel={handleCancelTask}
                        onRerun={(tmplId) => {
                          const tmpl = templates.find((t) => t.id === tmplId);
                          if (tmpl) handleOpenLaunchModal(tmpl);
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="glass-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              Select a template to view details, parameters, and live terminal logs.
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CREATE TEMPLATE MODAL */}
      {/* ========================================================================= */}
      {showCreateModal && ReactDOM.createPortal(
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                  <Layers size={20} />
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{editingTemplateId ? 'Edit Template' : 'Create Task Template'}</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateTemplate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Automation Engine Type Selector */}
              <div>
                <label className="form-label">Automation Engine Type *</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1.5px solid ${formType === 'ansible' ? '#ef4444' : 'var(--border-color)'}`,
                      backgroundColor: formType === 'ansible' ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-secondary)',
                      color: formType === 'ansible' ? '#ef4444' : 'var(--text-secondary)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                    onClick={() => {
                      setFormType('ansible');
                      if (formPlaybook.endsWith('.tf')) setFormPlaybook('playbook.yml');
                    }}
                  >
                    <span>📜 Ansible Playbook</span>
                  </button>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1.5px solid ${formType === 'terraform' ? '#a855f7' : 'var(--border-color)'}`,
                      backgroundColor: formType === 'terraform' ? 'rgba(147, 51, 234, 0.12)' : 'var(--bg-secondary)',
                      color: formType === 'terraform' ? '#a855f7' : 'var(--text-secondary)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                    onClick={() => {
                      setFormType('terraform');
                      if (!formPlaybook.endsWith('.tf')) setFormPlaybook('main.tf');
                      if (formExtraVars.includes('backup_type') || formExtraVars.includes('version')) {
                        setFormExtraVars('{\n  "environment": "production",\n  "region": "us-east-1",\n  "instance_count": 2,\n  "enable_backup": true\n}');
                      }
                      if (formLimit === 'all') setFormLimit('apply');
                    }}
                  >
                    <span>🏗️ Terraform HCL</span>
                  </button>
                </div>
              </div>

              {/* Form Fields for Ansible vs Terraform */}
              {formType === 'terraform' ? (
                <>
                  {/* Terraform Provider & Action Mode */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="form-label">Terraform Cloud Provider *</label>
                      <select
                        value={formProvider}
                        onChange={(e) => handleProviderChange(e.target.value)}
                        className="form-control"
                        style={{ fontWeight: 700 }}
                      >
                        <option value="aws">☁️ AWS (Amazon Web Services)</option>
                        <option value="azure">🔷 Azure (Microsoft Azure)</option>
                        <option value="gcp">🟡 GCP (Google Cloud Platform)</option>
                        <option value="local">🖥️ Local / On-Premise Execution</option>
                        <option value="kubernetes">🐋 Docker & Kubernetes</option>
                        <option value="custom">🔧 Custom HashiCorp Provider</option>
                      </select>
                    </div>

                    <div>
                      <label className="form-label">Terraform Execution Action *</label>
                      <select
                        value={formTfAction}
                        onChange={(e) => setFormTfAction(e.target.value as 'plan' | 'apply' | 'destroy')}
                        className="form-control"
                        style={{ fontWeight: 700 }}
                      >
                        <option value="apply">🚀 terraform apply (Provision & Deploy)</option>
                        <option value="plan">🔍 terraform plan (Preview Changes)</option>
                        <option value="destroy">💥 terraform destroy (Tear Down Infra)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Template Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Terraform AWS Postgres Cluster Provisioning"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="form-control"
                    />
                  </div>

                  <div>
                    <label className="form-label">Description</label>
                    <textarea
                      rows={2}
                      placeholder="Explain what this infrastructure provisioning task accomplishes..."
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      className="form-control"
                    />
                  </div>

                  {/* Repository & Main TF File */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="form-label">
                        <FolderGit2 size={13} style={{ display: 'inline', marginRight: 4 }} />
                        Repository *
                      </label>
                      <select
                        value={formRepoId}
                        onChange={(e) => setFormRepoId(e.target.value)}
                        className="form-control"
                        required
                      >
                        {repositories.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.branch})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="form-label">
                        <Code2 size={13} style={{ display: 'inline', marginRight: 4 }} />
                        Main TF Filename (*.tf) *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. main.tf or modules/db/main.tf"
                        value={formPlaybook}
                        onChange={(e) => setFormPlaybook(e.target.value)}
                        className="form-control"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>

                  {/* Cloud Credentials Profile */}
                  <div>
                    <label className="form-label">
                      <Sliders size={13} style={{ display: 'inline', marginRight: 4 }} />
                      Cloud Credentials & Environment Profile
                    </label>
                    <select
                      value={formEnvId}
                      onChange={(e) => setFormEnvId(e.target.value)}
                      className="form-control"
                    >
                      <option value="">-- Select Cloud Secrets Profile --</option>
                      {environments.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Terraform Input Variables */}
                  <div>
                    <label className="form-label">Terraform Input Variables (tfvars JSON)</label>
                    <textarea
                      rows={5}
                      value={formExtraVars}
                      onChange={(e) => setFormExtraVars(e.target.value)}
                      className="form-control"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                      placeholder={'{\n  "aws_region": "us-east-1",\n  "instance_type": "t3.medium"\n}'}
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* Database Engine Division Selector */}
                  <div>
                    <label className="form-label">
                      <Database size={13} style={{ display: 'inline', marginRight: 4 }} />
                      Database Engine / Platform Type *
                    </label>
                    <select
                      value={formDbType}
                      onChange={(e) => handleDbTypeChange(e.target.value as DatabaseType)}
                      className="form-control"
                      required
                      style={{ fontWeight: 700 }}
                    >
                      {templateDbOptions.map((type) => (
                        <option key={type.key} value={type.key}>
                          {type.icon} {type.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label">Template Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. MSSQL AlwaysOn Availability Group Failover"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="form-control"
                    />
                  </div>

                  <div>
                    <label className="form-label">Description</label>
                    <textarea
                      rows={2}
                      placeholder="Explain what this database automation task accomplishes..."
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      className="form-control"
                    />
                  </div>

                  {/* Repository & Playbook */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="form-label">
                        <FolderGit2 size={13} style={{ display: 'inline', marginRight: 4 }} />
                        Repository *
                      </label>
                      <select
                        value={formRepoId}
                        onChange={(e) => setFormRepoId(e.target.value)}
                        className="form-control"
                        required
                      >
                        {repositories.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.branch})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="form-label">
                        <Code2 size={13} style={{ display: 'inline', marginRight: 4 }} />
                        Playbook Filename (*.yml) *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. playbooks/site.yml"
                        value={formPlaybook}
                        onChange={(e) => setFormPlaybook(e.target.value)}
                        className="form-control"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>

                  {/* Target Inventory */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="form-label">
                        <Server size={13} style={{ display: 'inline', marginRight: 4 }} />
                        Target Inventory *
                      </label>
                      <select
                        value={formInvId}
                        onChange={(e) => setFormInvId(e.target.value)}
                        className="form-control"
                        required
                      >
                        {inventories.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name} ({i.hostCount} hosts)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Environment Profile */}
                  <div>
                    <label className="form-label">
                      <Sliders size={13} style={{ display: 'inline', marginRight: 4 }} />
                      Environment Profile
                    </label>
                    <select
                      value={formEnvId}
                      onChange={(e) => setFormEnvId(e.target.value)}
                      className="form-control"
                    >
                      <option value="">-- None --</option>
                      {environments.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Extra Variables */}
                  <div>
                    <label className="form-label">Default Database Extra Variables (JSON)</label>
                    <textarea
                      rows={4}
                      value={formExtraVars}
                      onChange={(e) => setFormExtraVars(e.target.value)}
                      className="form-control"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                    />
                  </div>

                  {/* Limit Pattern & Tags */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="form-label">Limit Pattern</label>
                      <input
                        type="text"
                        placeholder="all, postgres_cluster, mssql"
                        value={formLimit}
                        onChange={(e) => setFormLimit(e.target.value)}
                        className="form-control"
                      />
                    </div>
                    <div>
                      <label className="form-label">Playbook Tags</label>
                      <input
                        type="text"
                        placeholder="backup, failover, dba"
                        value={formTags}
                        onChange={(e) => setFormTags(e.target.value)}
                        className="form-control"
                      />
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingTemplateId ? 'Save Changes' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* LAUNCH EXECUTION MODAL */}
      {/* ========================================================================= */}
      {showLaunchModal && templateToLaunch && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 540 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
                  <Play size={20} fill="#10b981" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.8rem' }}>{getDbBadge(templateToLaunch.dbType).icon}</span>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Launch Database Task</h3>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {templateToLaunch.name}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowLaunchModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">Playbook Path</label>
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    backgroundColor: 'var(--bg-tertiary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.825rem',
                    color: 'var(--accent-primary)'
                  }}
                >
                  {templateToLaunch.playbook}
                </div>
              </div>

              <div>
                <label className="form-label">Target Host Limit Override</label>
                <input
                  type="text"
                  value={launchLimit}
                  onChange={(e) => setLaunchLimit(e.target.value)}
                  className="form-control"
                  placeholder="e.g. all, postgres_cluster, mssql-node-01"
                />
              </div>

              <div>
                <label className="form-label">Runtime Extra Variables (JSON)</label>
                <textarea
                  rows={4}
                  value={launchExtraVars}
                  onChange={(e) => setLaunchExtraVars(e.target.value)}
                  className="form-control"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button className="btn btn-secondary" onClick={() => setShowLaunchModal(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleLaunchExecution}
                  style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                >
                  <Play size={14} fill="white" />
                  <span>Start Execution</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
