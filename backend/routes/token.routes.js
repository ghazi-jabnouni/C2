import { Router } from 'express';
import { TokenController } from '../controllers/token.controller.js';

const router = Router();

// Token listing and revocation
router.get('/', TokenController.list);
router.post('/', TokenController.create);
router.delete('/:id', TokenController.delete);

export default router;
