import express from 'express';
import { TaskController } from '../controllers/task.controller.js';

const router = express.Router();

router.get('/', TaskController.list);
router.get('/:id', TaskController.getById);
router.post('/:id/cancel', TaskController.cancel);
router.delete('/:id', TaskController.remove);
router.delete('/', TaskController.clearHistory);

export default router;
