import React, { useState, useEffect } from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Play,
  Send,
  X,
  Code2,
  Search,
  Check,
  UserCheck,
  Radio
} from 'lucide-react';
import type { PendingRequest, TaskTemplate } from '../types';
import { api } from '../services/api';

interface PendingRequestsPageProps {
  onTaskApproved?: (taskId: string) => void;
}

export const PendingRequestsPage: React.FC<PendingRequestsPageProps> = ({ onTaskApproved }) => {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReq, setSelectedReq] = useState<PendingRequest | null>(null);
  const [selectedInspectVarsReq, setSelectedInspectVarsReq] = useState<PendingRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showSimulateClientModal, setShowSimulateClientModal] = useState(false);

  // Simulation form for testing client dispatch
  const [clientName, setClientName] = useState('Jenkins CI Runner #108');
  const [requestedBy, setRequestedBy] = useState('developer.qa@company.com');
  const [templateId, setTemplateId] = useState('');
  const [reason, setReason] = useState('Automated pull request staging verification test');
  const [extraVarsStr, setExtraVarsStr] = useState('{\n  "version": "v3.0.0-rc",\n  "test_mode": true\n}');

  const loadData = async () => {
    try {
      const [reqList, tmpls] = await Promise.all([
        api.getPendingRequests(),
        api.getTemplates()
      ]);
      setRequests(reqList);
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
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleApprove = async (req: PendingRequest) => {
    try {
      const res = await api.approveRequest(req.id, 'admin@semaphore.io');
      if (res.task && onTaskApproved) {
        onTaskApproved(res.task.id);
      }
      loadData();
    } catch (err) {
      alert(`Approval error: ${err}`);
    }
  };

  const handleOpenRejectModal = (req: PendingRequest) => {
    setSelectedReq(req);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (!selectedReq) return;
    try {
      await api.rejectRequest(selectedReq.id, rejectReason, 'admin@semaphore.io');
      setShowRejectModal(false);
      loadData();
    } catch (err) {
      alert(`Reject error: ${err}`);
    }
  };

  // Simulate an external client submitting a task request via API
  const handleSimulateClientDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let parsedVars = {};
      try {
        parsedVars = JSON.parse(extraVarsStr);
      } catch (err) {
        alert('Invalid Extra Vars JSON');
        return;
      }

      const res = await fetch('/api/v1/client/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName,
          requestedBy,
          templateId,
          reason,
          extraVars: parsedVars
        })
      });

      if (!res.ok) throw new Error(`Status: ${res.status}`);
      setShowSimulateClientModal(false);
      loadData();
    } catch (err) {
      alert(`Dispatch error: ${err}`);
    }
  };

  const pendingList = requests.filter((r) => r.status === 'pending');
  const reviewedList = requests.filter((r) => r.status !== 'pending');

  const filteredPending = pendingList.filter(
    (r) =>
      r.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.requestedBy.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.templateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reason.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Client Execution Approvals
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Review, inspect injected parameters, and approve or reject task dispatch requests from external pipelines.
          </p>
        </div>

        <button className="btn btn-secondary" onClick={() => setShowSimulateClientModal(true)}>
          <Send size={15} />
          <span>Simulate Client Dispatch</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ padding: 10, borderRadius: 8, backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
            <Clock size={20} className={pendingList.length > 0 ? 'pulse-running' : ''} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{pendingList.length}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pending Approvals</div>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ padding: 10, borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
              {requests.filter((r) => r.status === 'approved').length}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Approved Runs</div>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ padding: 10, borderRadius: 8, backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' }}>
            <XCircle size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
              {requests.filter((r) => r.status === 'rejected').length}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Declined Requests</div>
          </div>
        </div>
      </div>

      {/* Search Filter */}
      <div style={{ position: 'relative', maxWidth: 380 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Filter requests by client, requester, or template..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="form-control"
          style={{ paddingLeft: 36, height: 38 }}
        />
      </div>

      {/* ========================================================================= */}
      {/* PENDING APPROVALS LIST / TABLE VIEW */}
      {/* ========================================================================= */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Radio size={16} style={{ color: '#f59e0b' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>
            Pending Queue ({pendingList.length})
          </h3>
        </div>

        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    borderBottom: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase'
                  }}
                >
                  <th style={{ padding: '14px 20px' }}>Target Template</th>
                  <th style={{ padding: '14px 20px' }}>Client & Requester</th>
                  <th style={{ padding: '14px 20px' }}>Justification</th>
                  <th style={{ padding: '14px 20px' }}>Variables</th>
                  <th style={{ padding: '14px 20px' }}>Submitted Time</th>
                  <th style={{ padding: '14px 20px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPending.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <Check size={28} color="#10b981" style={{ margin: '0 auto 6px' }} />
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>No pending approvals</div>
                      <span style={{ fontSize: '0.775rem' }}>All external client execution requests are up to date.</span>
                    </td>
                  </tr>
                ) : (
                  filteredPending.map((req) => (
                    <tr
                      key={req.id}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      {/* Item Target */}
                      <td style={{ padding: '14px 20px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
                              className={`badge ${req.itemType === 'workflow' ? 'badge-info' : 'badge-secondary'}`}
                              style={{ fontSize: '0.625rem', padding: '1px 5px' }}
                            >
                              {req.itemType === 'workflow' ? 'WORKFLOW' : 'TEMPLATE'}
                            </span>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.925rem' }}>
                              {req.templateName}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                            {req.id}
                          </div>
                        </div>
                      </td>

                      {/* Client + Requester */}
                      <td style={{ padding: '14px 20px' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <UserCheck size={14} style={{ color: 'var(--accent-primary)' }} />
                            <span>{req.clientName}</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {req.requestedBy} • <code>{req.clientIp}</code>
                          </div>
                        </div>
                      </td>

                      {/* Reason */}
                      <td style={{ padding: '14px 20px', maxWidth: 280 }}>
                        <span
                          style={{
                            fontSize: '0.8rem',
                            color: 'var(--text-secondary)',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}
                        >
                          {req.reason || 'No justification specified.'}
                        </span>
                      </td>

                      {/* Variables inspector button */}
                      <td style={{ padding: '14px 20px' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setSelectedInspectVarsReq(req)}
                          style={{ fontSize: '0.75rem', gap: 6 }}
                        >
                          <Code2 size={13} style={{ color: 'var(--accent-primary)' }} />
                          <span>Inspect JSON</span>
                        </button>
                      </td>

                      {/* Submitted Time */}
                      <td style={{ padding: '14px 20px', color: 'var(--text-muted)', fontSize: '0.785rem' }}>
                        {new Date(req.submittedAt).toLocaleTimeString()}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 8 }}>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                            onClick={() => handleApprove(req)}
                            title="Approve & Launch Playbook"
                          >
                            <Play size={12} fill="white" />
                            <span>Approve</span>
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ color: '#ef4444' }}
                            onClick={() => handleOpenRejectModal(req)}
                            title="Reject Request"
                          >
                            <XCircle size={13} />
                            <span>Reject</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* REVIEWED REQUEST HISTORY TABLE */}
      {/* ========================================================================= */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 14 }}>
          Reviewed Request Audit History ({reviewedList.length})
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '10px 14px' }}>STATUS</th>
                <th style={{ padding: '10px 14px' }}>TEMPLATE</th>
                <th style={{ padding: '10px 14px' }}>CLIENT / REQUESTER</th>
                <th style={{ padding: '10px 14px' }}>REVIEWED BY</th>
                <th style={{ padding: '10px 14px' }}>TIMESTAMP</th>
              </tr>
            </thead>
            <tbody>
              {reviewedList.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px 14px' }}>
                    <span className={`badge ${r.status === 'approved' ? 'badge-success' : 'badge-danger'}`}>
                      {r.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {r.templateName}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    {r.clientName} ({r.requestedBy})
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                    {r.reviewedBy || 'System'}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>
                    {new Date(r.submittedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect Variables Modal */}
      {selectedInspectVarsReq && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Code2 size={20} style={{ color: 'var(--accent-primary)' }} />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Client Runtime Variables</h3>
              </div>
              <button
                onClick={() => setSelectedInspectVarsReq(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              Payload submitted by <strong>{selectedInspectVarsReq.clientName}</strong> for template <strong>{selectedInspectVarsReq.templateName}</strong>:
            </p>

            <pre
              style={{
                padding: '14px 16px',
                borderRadius: 8,
                backgroundColor: 'var(--terminal-bg)',
                color: 'var(--terminal-text)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.825rem',
                overflowX: 'auto',
                border: '1px solid var(--border-color)'
              }}
            >
              {JSON.stringify(selectedInspectVarsReq.extraVars, null, 2)}
            </pre>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setSelectedInspectVarsReq(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 440 }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ef4444', marginBottom: 12 }}>
              Decline Execution Request
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
              Provide a reason why this execution request was declined by the operator:
            </p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Freeze period in effect / Invalid release version"
              className="form-control"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowRejectModal(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleReject}>
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simulate Client Dispatch Modal */}
      {showSimulateClientModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Send size={18} style={{ color: 'var(--accent-primary)' }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Simulate Client Dispatch</h3>
              </div>
              <button
                onClick={() => setShowSimulateClientModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSimulateClientDispatch} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">Client Identity / CI Runner *</label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="form-control"
                />
              </div>

              <div>
                <label className="form-label">Requested By (Email / Service) *</label>
                <input
                  type="text"
                  required
                  value={requestedBy}
                  onChange={(e) => setRequestedBy(e.target.value)}
                  className="form-control"
                />
              </div>

              <div>
                <label className="form-label">Target Template *</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="form-control"
                  required
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Reason / Justification</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="form-control"
                />
              </div>

              <div>
                <label className="form-label">Client Extra Variables (JSON)</label>
                <textarea
                  rows={3}
                  value={extraVarsStr}
                  onChange={(e) => setExtraVarsStr(e.target.value)}
                  className="form-control"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowSimulateClientModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Dispatch Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
