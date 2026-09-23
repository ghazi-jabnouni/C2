import { WorkflowModel } from '../models/workflow.model.js';

export const WorkflowController = {
  list: (req, res) => {
    try { res.json(WorkflowModel.findAll()); } catch (err) { res.status(500).json({ error: err.message }); }
  },
  create: (req, res) => {
    try {
      if (!req.body.name) return res.status(400).json({ error: 'Name is required' });
      res.status(201).json(WorkflowModel.create(req.body));
    } catch (err) { res.status(500).json({ error: err.message }); }
  },
  update: (req, res) => {
    try {
      const updated = WorkflowModel.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Workflow not found' });
      res.json(updated);
    } catch (err) { res.status(500).json({ error: err.message }); }
  },
  remove: (req, res) => {
    try {
      if (!WorkflowModel.delete(req.params.id)) return res.status(404).json({ error: 'Workflow not found' });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },
  approvalDecision: (req, res) => {
    try {
      const { id, nodeId } = req.params;
      const { decision } = req.body;
      const wf = WorkflowModel.findById(id);
      if (!wf) return res.status(404).json({ error: 'Workflow not found' });
      const nodes = wf.nodes.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            status: decision === 'yes' ? 'success' : 'failed',
            approvalDecision: decision
          };
        }
        return n;
      });
      const updated = WorkflowModel.update(id, { ...wf, nodes });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};
