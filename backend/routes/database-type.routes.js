import express from 'express';
import { DatabaseTypeController } from '../controllers/database-type.controller.js';

const router = express.Router();
router.get('/', DatabaseTypeController.list);
router.post('/', DatabaseTypeController.create);
router.put('/:id', DatabaseTypeController.update);
router.delete('/:id', DatabaseTypeController.remove);

export default router;
