import express from 'express';
import { InventoryController } from '../controllers/inventory.controller.js';

const router = express.Router();

router.get('/', InventoryController.list);
router.post('/', InventoryController.create);
router.put('/:id', InventoryController.update);
router.delete('/:id', InventoryController.remove);

export default router;
