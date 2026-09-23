import express from 'express';
import { PendingRequestController } from '../controllers/pending-request.controller.js';

const router = express.Router();

router.get('/', PendingRequestController.list);
router.post('/', PendingRequestController.create);
router.post('/:id/approve', PendingRequestController.approve);
router.post('/:id/reject', PendingRequestController.reject);

export default router;
