import express from 'express';
import { EnvironmentController } from '../controllers/environment.controller.js';

const router = express.Router();

router.get('/', EnvironmentController.list);
router.post('/', EnvironmentController.create);
router.put('/:id', EnvironmentController.update);
router.delete('/:id', EnvironmentController.remove);

export default router;
