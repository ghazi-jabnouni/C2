import express from 'express';
import { ScheduleController } from '../controllers/schedule.controller.js';

const router = express.Router();

router.get('/', ScheduleController.list);
router.post('/', ScheduleController.create);
router.put('/:id', ScheduleController.update);
router.delete('/:id', ScheduleController.remove);

export default router;
