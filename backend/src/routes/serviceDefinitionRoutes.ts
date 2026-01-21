import { Router } from 'express';
import { createServiceDefinition, getServiceDefinitions, deleteServiceDefinition, debugForceSeed, swapVehicle } from '../controllers/serviceDefinitionController';
import { getOptimizationSuggestions } from '../controllers/optimizationController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.get('/optimize', authenticate, getOptimizationSuggestions);
router.post('/', authenticate, createServiceDefinition);
router.get('/', authenticate, getServiceDefinitions);
router.delete('/:id', authenticate, deleteServiceDefinition);
router.patch('/:id/swap', authenticate, swapVehicle);

export default router;
