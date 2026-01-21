
import { Router } from 'express';
import { UniversalController } from '../controllers/universalController';
import { authenticate, requireRole } from '../middleware/authMiddleware';

const router = Router();

// Todas las rutas requieren autenticación.
// Dependiendo del nivel de seguridad deseado, podríamos requerir 'Admin' para importar/editar.
router.use(authenticate);

router.get('/:entity/list', UniversalController.list);
router.post('/:entity/import', requireRole(['Admin', 'SuperAdmin']), UniversalController.import);
router.post('/:entity', requireRole(['Admin', 'SuperAdmin']), UniversalController.create);
router.put('/:entity/:id', requireRole(['Admin', 'SuperAdmin']), UniversalController.update);
router.delete('/:entity/:id', requireRole(['Admin', 'SuperAdmin']), UniversalController.delete);

export default router;
