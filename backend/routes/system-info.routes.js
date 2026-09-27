import { Router } from 'express';
import { SystemInfoController } from '../controllers/system-info.controller.js';

const router = Router();

// GET /api/system-info
router.get('/', SystemInfoController.get);
router.get('/performance', SystemInfoController.performance);

export default router;
