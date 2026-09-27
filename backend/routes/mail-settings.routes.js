import express from 'express';
import { MailSettingsController } from '../controllers/mail-settings.controller.js';

const router = express.Router();
router.get('/', MailSettingsController.get);
router.put('/', MailSettingsController.save);
router.post('/test', MailSettingsController.sendTest);

export default router;