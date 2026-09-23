import { Router } from 'express';
import { SystemInfoController } from '../controllers/system-info.controller.js';

const router = Router();

// GET /api/system-info
router.get('/', SystemInfoController.get);

export default router;
