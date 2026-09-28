import { PendingRequestModel } from '../models/pending-request.model.js';
import { WorkflowModel } from '../models/workflow.model.js';
import { WorkflowRunner } from '../services/workflow-runner.js';
import { startTemplateExecution } from './template.controller.js';

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
    let claimedRequest;
    try {
      claimedRequest = PendingRequestModel.claimForApproval(req.params.id, req.body?.reviewedBy);
      if (!claimedRequest) {
        const existing = PendingRequestModel.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Pending request not found' });
        return res.status(409).json({ error: `Request is already ${existing.status}.` });
      }

      let extraVars = claimedRequest.extraVars || {};
      if (typeof extraVars === 'string') {
        try { extraVars = JSON.parse(extraVars); } catch {
          const error = new Error('Request variables are invalid JSON.');
          error.statusCode = 400;
          throw error;
        }
      }
      if (!extraVars || typeof extraVars !== 'object' || Array.isArray(extraVars)) {
        PendingRequestModel.releaseApproval(claimedRequest.id);
        return res.status(400).json({ error: 'Request variables must be a JSON object.' });
      }

      let task;
      let workflowRun;
      if (claimedRequest.itemType === 'workflow' || claimedRequest.workflowId) {
        if (!claimedRequest.workflowId) {
          const error = new Error('This workflow request has no workflow ID.');
          error.statusCode = 400;
          throw error;
        }
        const workflow = WorkflowModel.findById(claimedRequest.workflowId);
        if (!workflow) {
          const error = new Error('The requested workflow no longer exists.');
          error.statusCode = 404;
          throw error;
        }
        workflowRun = WorkflowRunner.start(workflow, {
          extraVars,
          triggeredBy: `Approved request: ${claimedRequest.id}`,
          serviceName: extraVars.service_name,
          srNumber: extraVars.sr_number,
          handoffMessage: extraVars.handoff_message
        });
      } else {
        task = startTemplateExecution(claimedRequest.templateId, {
          extraVars,
          triggeredBy: `Approved request: ${claimedRequest.id}`
        });
        if (!task) {
          const error = new Error('The requested task template no longer exists.');
          error.statusCode = 404;
          throw error;
        }
      }

      const approvedRequest = PendingRequestModel.completeApproval(claimedRequest.id);
      res.json({
        message: workflowRun ? 'Request approved and workflow started.' : 'Request approved and task started.',
        request: approvedRequest,
        task,
        workflowRun,
        workflowId: claimedRequest.workflowId
      });
    } catch (err) {
      if (claimedRequest) PendingRequestModel.releaseApproval(claimedRequest.id);
      console.error(err);
      res.status(err.statusCode || 500).json({ error: err instanceof Error ? err.message : 'Failed to approve request' });
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
