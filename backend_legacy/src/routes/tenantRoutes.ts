
import { Router } from 'express';
import { getAllTenants, createTenant, updateTenant, deleteTenant } from '../controllers/tenantController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// Todas las rutas de tenants deberían ser para SuperAdmin, pero por ahora solo autenticadas
// para facilitar pruebas. Idealmente añadir middleware de rol.
router.get('/', authenticate, getAllTenants);
router.post('/', authenticate, createTenant);
router.put('/:id', authenticate, updateTenant);
router.delete('/:id', authenticate, deleteTenant);

export default router;
