
import { Router } from 'express';
import * as ServiceDefinitionController from '../controllers/serviceDefinitionController';

const router = Router();

router.get('/', ServiceDefinitionController.getServiceDefinitions);
router.post('/', ServiceDefinitionController.createServiceDefinition);
router.get('/:currentServiceId/next', ServiceDefinitionController.getNextRotation);

export default router;
