import React, { useState, useEffect } from 'react';
import {
  Plus,
  X,
  Play,
  Trash2
} from 'lucide-react';
import type { Workflow, TaskTemplate } from '../types';
import { api } from '../services/api';

interface WorkflowBuilderPageProps {
  onOpenWorkflowDiagram?: (id: string) => void;
}

export const WorkflowBuilderPage: React.FC<WorkflowBuilderPageProps> = ({ onOpenWorkflowDiagram }) => {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  void templates;
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');

  const loadData = async () => {
    try {
      const [wfs, tmpls] = await Promise.all([
        api.getWorkflows(),
        api.getTemplates()
      ]);
      setTemplates(tmpls);
      setWorkflows(wfs);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateWorkflow = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const created = await api.createWorkflow({ name: workflowName.trim(), description: workflowDescription.trim(), nodes: [], edges: [] });
      setWorkflows((current) => [created, ...current]);
      setWorkflowName('');
      setWorkflowDescription('');
      setShowWorkflowModal(false);
    } catch (error) {
      alert(`Failed to create workflow: ${error}`);
    }
  };

  const handleDeleteWorkflow = async (workflowId: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    try {
      await api.deleteWorkflow(workflowId);
      setWorkflows((prev) => prev.filter((w) => w.id !== workflowId));
    } catch (err) {
      alert(`Failed to delete workflow: ${err}`);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Visual DAG Multi-Playbook Workflows
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Chain multiple Ansible playbooks, conditional branches, approvals, and rollback handlers into a single automated pipeline diagram.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setShowWorkflowModal(true)}>
            <Plus size={14} />
            <span>New Workflow</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="glass-panel" style={{ padding: 16, overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>Workflows</h3>
            <span className="badge badge-info">{workflows.length}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '9px 12px' }}>WORKFLOW</th>
                <th style={{ padding: '9px 12px' }}>PLAYBOOKS</th>
                <th style={{ padding: '9px 12px' }}>RUNS</th>
                <th style={{ padding: '9px 12px' }}>STATUS</th>
                <th style={{ padding: '9px 12px', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((workflow) => (
                <tr
                key={workflow.id}
                style={{
                  borderBottom: '1px solid var(--border-color)', cursor: 'pointer',
                  color: 'var(--text-primary)'
                }}
              >
                <td style={{ padding: '12px' }}><strong>{workflow.name}</strong><div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: 3 }}>{workflow.description || 'No description'}</div></td>
                <td style={{ padding: '12px' }}>{workflow.nodes.length}</td>
                <td style={{ padding: '12px' }}>{workflow.totalRuns || 0}</td>
                <td style={{ padding: '12px' }}><span className="badge badge-info">{workflow.lastRunStatus}</span></td>
                <td style={{ padding: '12px', textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary btn-sm" onClick={(event) => { event.stopPropagation(); onOpenWorkflowDiagram?.(workflow.id); }}>
                    <Play size={12} /> Diagram
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}
                    onClick={(event) => { event.stopPropagation(); handleDeleteWorkflow(workflow.id); }}
                    title="Delete Workflow"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </td>
              </tr>
            ))}
            {workflows.length === 0 && <tr><td colSpan={5} style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>Create your first workflow.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Workflow Modal */}
      {showWorkflowModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Create Workflow</h3>
              <button onClick={() => setShowWorkflowModal(false)} style={{ background: 'none', border: 0, color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateWorkflow} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input className="form-control" required placeholder="e.g. SQL Server Installation" value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} />
              <textarea className="form-control" rows={3} placeholder="Describe the workflow purpose" value={workflowDescription} onChange={(event) => setWorkflowDescription(event.target.value)} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowWorkflowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Workflow</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
