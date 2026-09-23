import { Router } from 'express';
import { RepositoryController } from '../controllers/repository.controller.js';

const router = Router();

router.get('/', RepositoryController.getRepositories);
router.get('/:id', RepositoryController.getRepositoryById);
router.post('/:id/sync', RepositoryController.syncRepository);
router.post('/', RepositoryController.createRepository);
router.put('/:id', RepositoryController.updateRepository);
router.delete('/:id', RepositoryController.deleteRepository);

export default router;
