import express from 'express';
import { WorkflowController } from '../controllers/workflow.controller.js';

const router = express.Router();
router.get('/', WorkflowController.list);
router.post('/', WorkflowController.create);
router.put('/:id', WorkflowController.update);
router.get('/:id/runs/:runId', WorkflowController.getRun);
router.delete('/:id/runs/:runId', WorkflowController.removeRun);
router.post('/:id/runs/:runId/approval/:nodeId', WorkflowController.approveRun);
router.post('/:id/run', WorkflowController.run);
router.post('/:id/nodes/:nodeId/email', WorkflowController.sendEmailNode);
router.post('/:id/nodes/:nodeId/webhook', WorkflowController.sendWebhookNode);
router.post('/:id/approval/:nodeId', WorkflowController.approvalDecision);
router.delete('/:id', WorkflowController.remove);

export default router;
