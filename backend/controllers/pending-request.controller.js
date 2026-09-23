import { PendingRequestModel } from '../models/pending-request.model.js';

export const PendingRequestController = {
  list: (req, res) => {
    try {
      res.json(PendingRequestModel.findAll());
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to list pending requests' });
    }
  },

  create: (req, res) => {
    try {
      const { templateId, workflowId } = req.body;
      if (!templateId && !workflowId) return res.status(400).json({ error: 'templateId or workflowId is required' });
      const created = PendingRequestModel.create(req.body);
      res.status(201).json(created);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create pending request' });
    }
  },

  approve: (req, res) => {
    try {
      const pr = PendingRequestModel.approve(req.params.id, req.body?.reviewedBy);
      if (!pr) return res.status(404).json({ error: 'Pending request not found' });
      res.json(pr);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to approve request' });
    }
  },

  reject: (req, res) => {
    try {
      const pr = PendingRequestModel.reject(req.params.id, req.body?.reviewedBy, req.body?.rejectionReason);
      if (!pr) return res.status(404).json({ error: 'Pending request not found' });
      res.json(pr);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to reject request' });
    }
  }
};

export default PendingRequestController;
