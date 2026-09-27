import express from 'express';
import { RuntimeSettingsController } from '../controllers/runtime-settings.controller.js';

const router = express.Router();
router.get('/', RuntimeSettingsController.get);
router.put('/', RuntimeSettingsController.save);

export default router;