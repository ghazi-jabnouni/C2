import express from 'express';
import { TemplateController } from '../controllers/template.controller.js';

const router = express.Router();

router.get('/', TemplateController.list);
router.get('/:id', TemplateController.getById);
router.post('/', TemplateController.create);
router.put('/:id', TemplateController.update);
router.delete('/:id', TemplateController.remove);
router.post('/:id/run', TemplateController.run);

export default router;
