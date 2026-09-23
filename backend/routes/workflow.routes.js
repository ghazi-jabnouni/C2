import express from 'express';
import { WorkflowController } from '../controllers/workflow.controller.js';

const router = express.Router();
router.get('/', WorkflowController.list);
router.post('/', WorkflowController.create);
router.put('/:id', WorkflowController.update);
router.post('/:id/approval/:nodeId', WorkflowController.approvalDecision);
router.delete('/:id', WorkflowController.remove);

export default router;
