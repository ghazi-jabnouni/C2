import express from 'express';
import { CredentialController } from '../controllers/credential.controller.js';

const router = express.Router();

router.get('/', CredentialController.list);
router.post('/', CredentialController.create);
router.put('/:id', CredentialController.update);
router.delete('/:id', CredentialController.remove);

export default router;
