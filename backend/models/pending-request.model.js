import db from '../config/db.js';

export const PendingRequestModel = {
  findAll: () => {
    return db.prepare('SELECT * FROM pending_requests ORDER BY rowid DESC').all();
  },

  findById: (id) => {
    return db.prepare('SELECT * FROM pending_requests WHERE id = ?').get(id) || null;
  },

  create: (data) => {
    const id = `req-${Date.now()}`;
    const now = new Date().toISOString();
    const itemType = data.itemType || 'template';
    const workflowId = data.workflowId || null;
    const stmt = db.prepare(`
      INSERT INTO pending_requests (id, clientName, clientIp, templateId, templateName, submittedAt, status, requestedBy, extraVars, reason, itemType, workflowId)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      data.clientName || '',
      data.clientIp || '',
      data.templateId || '',
      data.templateName || '',
      now,
      data.requestedBy || '',
      typeof data.extraVars === 'string' ? data.extraVars : JSON.stringify(data.extraVars || {}),
      data.reason || '',
      itemType,
      workflowId
    );
    return PendingRequestModel.findById(id);
  },

  approve: (id, reviewedBy) => {
    const now = new Date().toISOString();
    db.prepare(`UPDATE pending_requests SET status = 'approved', reviewedBy = ?, reviewedAt = ? WHERE id = ? AND status = 'pending'`)
      .run(reviewedBy || 'Admin', now, id);
    return PendingRequestModel.findById(id);
  },

  reject: (id, reviewedBy, rejectionReason) => {
    const now = new Date().toISOString();
    db.prepare(`UPDATE pending_requests SET status = 'rejected', reviewedBy = ?, reviewedAt = ?, rejectionReason = ? WHERE id = ? AND status = 'pending'`)
      .run(reviewedBy || 'Admin', now, rejectionReason || '', id);
    return PendingRequestModel.findById(id);
  },

  delete: (id) => {
    const info = db.prepare('DELETE FROM pending_requests WHERE id = ?').run(id);
    return info.changes > 0;
  }
};
