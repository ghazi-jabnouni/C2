import React, { useState, useEffect } from 'react';
import {
  Layers,
  GitFork,
  Send,
  Plus,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  X,
  Sliders,
  Sparkles
} from 'lucide-react';
import type { TaskTemplate, Workflow, PendingRequest } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface VariablePair {
  key: string;
  value: string;
}

export const RequestCatalogPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'catalog' | 'my-requests'>('catalog');
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [myRequests, setMyRequests] = useState<PendingRequest[]>([]);
  const [showRequestModal, setShowRequestModal] = useState(false);

  // Selected item for request modal
  const [requestItemType, setRequestItemType] = useState<'template' | 'workflow'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);

  // Request form state
  const [requesterName, setRequesterName] = useState(user?.name || 'Requester User');
  const [requesterEmail, setRequesterEmail] = useState(user?.email || 'requester@c2platform.local');
  const [reason, setReason] = useState('Deployment and testing request');
  const [varPairs, setVarPairs] = useState<VariablePair[]>([
    { key: 'environment', value: 'staging' },
    { key: 'release_version', value: 'v2.4.0' }
  ]);
  const [jsonVarsMode, setJsonVarsMode] = useState(false);
  const [customJsonVars, setCustomJsonVars] = useState('{\n  "environment": "staging",\n  "release_version": "v2.4.0"\n}');

  const loadData = async () => {
    try {
      const [tmpls, wfs, reqs] = await Promise.all([
        api.getTemplates(),
        api.getWorkflows(),
        api.getPendingRequests()
      ]);
      setTemplates(tmpls);
      setWorkflows(wfs);
      setMyRequests(reqs);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenTemplateRequest = (template: TaskTemplate) => {
    setRequestItemType('template');
    setSelectedTemplate(template);
    setSelectedWorkflow(null);

    // Pre-fill extra vars if available
    let parsedVars: Record<string, any> = {};
    try {
      parsedVars = JSON.parse(template.extraVars || '{}');
    } catch (_) {}

    const initialPairs = Object.entries(parsedVars).map(([key, value]) => ({
      key,
      value: String(value)
    }));

    if (initialPairs.length === 0) {
      setVarPairs([
        { key: 'environment', value: 'staging' },
        { key: 'release_version', value: 'v2.4.0' }
      ]);
      setCustomJsonVars('{\n  "environment": "staging",\n  "release_version": "v2.4.0"\n}');
    } else {
      setVarPairs(initialPairs);
      setCustomJsonVars(JSON.stringify(parsedVars, null, 2));
    }

    setShowRequestModal(true);
  };

  const handleOpenWorkflowRequest = (workflow: Workflow) => {
    setRequestItemType('workflow');
    setSelectedWorkflow(workflow);
    setSelectedTemplate(null);

    setVarPairs([
      { key: 'pipeline_target', value: 'staging' },
      { key: 'notify_on_complete', value: 'true' }
    ]);
    setCustomJsonVars('{\n  "pipeline_target": "staging",\n  "notify_on_complete": true\n}');

    setShowRequestModal(true);
  };

  const handleAddVarPair = () => {
    setVarPairs((prev) => [...prev, { key: '', value: '' }]);
  };

  const handleRemoveVarPair = (index: number) => {
    setVarPairs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleVarChange = (index: number, field: 'key' | 'value', val: string) => {
    setVarPairs((prev) => {
      const updated = [...prev];
      updated[index][field] = val;
      return updated;
    });
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let finalExtraVars: Record<string, any> = {};
      if (jsonVarsMode) {
        try {
          finalExtraVars = JSON.parse(customJsonVars);
        } catch (_) {
          alert('Invalid JSON in custom parameters format. Please check syntax.');
          return;
        }
      } else {
        varPairs.forEach((pair) => {
          if (pair.key.trim()) {
            finalExtraVars[pair.key.trim()] = pair.value.trim();
          }
        });
      }

      const templateId = requestItemType === 'template' ? selectedTemplate?.id || '' : (selectedWorkflow?.nodes[0]?.templateId || '');
      const templateName = requestItemType === 'template' ? (selectedTemplate?.name || 'Task Request') : `Workflow: ${selectedWorkflow?.name || 'DAG Pipeline'}`;

      const payload = {
        clientName: requesterName,
        clientIp: '127.0.0.1',
        templateId,
        templateName,
        itemType: requestItemType,
        workflowId: requestItemType === 'workflow' ? selectedWorkflow?.id : undefined,
        requestedBy: requesterEmail,
        extraVars: finalExtraVars,
        reason: reason.trim() || 'Execution request with custom parameters'
      };

      const created = await api.createPendingRequest(payload);
      setMyRequests((prev) => [created, ...prev]);
      setShowRequestModal(false);
      setActiveTab('my-requests');
      alert(`Request submitted successfully! Target ID: ${created.id}`);
    } catch (err) {
      alert(`Failed to submit request: ${err}`);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Service Request Catalog
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Request task playbooks or multi-stage visual workflow diagrams with custom runtime parameter variables.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className={`btn ${activeTab === 'catalog' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('catalog')}
          >
            <Sparkles size={15} />
            <span>Catalog ({templates.length + workflows.length})</span>
          </button>
          <button
            className={`btn ${activeTab === 'my-requests' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('my-requests')}
          >
            <Clock size={15} />
            <span>My Requests ({myRequests.length})</span>
          </button>
        </div>
      </div>

      {activeTab === 'catalog' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {/* Section 1: Task Templates Catalog */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Layers size={18} style={{ color: 'var(--accent-primary)' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Ansible & Terraform Task Templates</h3>
              <span className="badge badge-info">{templates.length} Available</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {templates.map((tmpl) => (
                <div key={tmpl.id} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <span className={`badge ${tmpl.type === 'terraform' ? 'badge-running' : 'badge-info'}`} style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>
                        {tmpl.type || 'ansible'}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {tmpl.playbook}
                      </span>
                    </div>

                    <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
                      {tmpl.name}
                    </h4>

                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {tmpl.description || 'No description available'}
                    </p>
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={() => handleOpenTemplateRequest(tmpl)}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    <Send size={14} />
                    <span>Request Execution</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Visual Workflow Diagrams Catalog */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <GitFork size={18} style={{ color: '#a855f7' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Visual Workflow Diagrams (DAG Pipelines)</h3>
              <span className="badge badge-running">{workflows.length} Available</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {workflows.map((wf) => (
                <div key={wf.id} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14, borderColor: 'rgba(168, 85, 247, 0.4)' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <span className="badge badge-running" style={{ fontSize: '0.68rem' }}>
                        {wf.nodes.length} Stages Connected
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        DAG Pipeline
                      </span>
                    </div>

                    <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
                      {wf.name}
                    </h4>

                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {wf.description || 'Multi-stage automated pipeline diagram'}
                    </p>
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={() => handleOpenWorkflowRequest(wf)}
                    style={{ width: '100%', justifyContent: 'center', backgroundColor: '#a855f7', borderColor: '#a855f7' }}
                  >
                    <Send size={14} fill="white" />
                    <span>Request Workflow Execution</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Tab 2: My Submitted Requests */
        <div className="glass-panel" style={{ padding: '20px', overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>My Execution Requests</h3>
            <span className="badge badge-info">{myRequests.length} Total</span>
          </div>

          {myRequests.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Clock size={40} style={{ opacity: 0.5, marginBottom: 12 }} />
              <p>No execution requests submitted yet. Browse the catalog to request a task or workflow diagram.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px' }}>STATUS</th>
                  <th style={{ padding: '10px 12px' }}>REQUESTED TARGET</th>
                  <th style={{ padding: '10px 12px' }}>REQUESTER</th>
                  <th style={{ padding: '10px 12px' }}>VARIABLES</th>
                  <th style={{ padding: '10px 12px' }}>SUBMITTED AT</th>
                  <th style={{ padding: '10px 12px' }}>REASON</th>
                </tr>
              </thead>
              <tbody>
                {myRequests.map((req) => (
                  <tr key={req.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px' }}>
                      {req.status === 'approved' ? (
                        <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle2 size={12} /> APPROVED
                        </span>
                      ) : req.status === 'rejected' ? (
                        <span className="badge badge-failed" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <XCircle size={12} /> REJECTED
                        </span>
                      ) : (
                        <span className="badge badge-running" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={12} className="pulse-running" /> PENDING
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {req.itemType === 'workflow' ? '🌐 ' : '📄 '}
                      {req.templateName}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                      {req.requestedBy}
                    </td>
                    <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                      {JSON.stringify(req.extraVars)}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)' }}>
                      {new Date(req.submittedAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)' }}>
                      {req.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Request Execution Modal */}
      {showRequestModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 540 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Send size={20} style={{ color: 'var(--accent-primary)' }} />
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
                    Request Execution: {requestItemType === 'template' ? selectedTemplate?.name : selectedWorkflow?.name}
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Specify parameter variables and submit for operator review
                  </span>
                </div>
              </div>
              <button onClick={() => setShowRequestModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitRequest} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Requester Name</label>
                  <input
                    type="text"
                    required
                    value={requesterName}
                    onChange={(e) => setRequesterName(e.target.value)}
                    className="form-control"
                  />
                </div>
                <div>
                  <label className="form-label">Requester Email</label>
                  <input
                    type="email"
                    required
                    value={requesterEmail}
                    onChange={(e) => setRequesterEmail(e.target.value)}
                    className="form-control"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Business Reason / Ticket Reference</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. JIRA-4092: Deploy staging environment for QA testing"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="form-control"
                />
              </div>

              {/* Custom Parameter Variables Editor */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sliders size={14} style={{ color: 'var(--accent-primary)' }} />
                    <span>Runtime Parameter Variables (extra_vars)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setJsonVarsMode(!jsonVarsMode)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
                  >
                    {jsonVarsMode ? 'Switch to Key-Value Builder' : 'Switch to Raw JSON'}
                  </button>
                </div>

                {jsonVarsMode ? (
                  <textarea
                    rows={6}
                    value={customJsonVars}
                    onChange={(e) => setCustomJsonVars(e.target.value)}
                    className="form-control"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {varPairs.map((pair, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="text"
                          placeholder="Variable Key (e.g. target_env)"
                          value={pair.key}
                          onChange={(e) => handleVarChange(idx, 'key', e.target.value)}
                          className="form-control"
                          style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                        />
                        <span style={{ color: 'var(--text-muted)' }}>=</span>
                        <input
                          type="text"
                          placeholder="Value (e.g. staging)"
                          value={pair.value}
                          onChange={(e) => handleVarChange(idx, 'value', e.target.value)}
                          className="form-control"
                          style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveVarPair(idx)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleAddVarPair}
                      style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: '0.75rem', marginTop: 4 }}
                    >
                      <Plus size={12} />
                      <span>Add Variable Parameter</span>
                    </button>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRequestModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <Send size={14} />
                  <span>Submit Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
