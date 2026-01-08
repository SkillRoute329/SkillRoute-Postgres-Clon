import { Router } from 'express';
import { whatsAppService } from '../services/whatsappService';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.get('/status', authenticate, (req, res) => {
    // Check admin role
    const user = (req as any).user;
    if (user.role !== 'Admin' && user.role !== 'SuperAdmin') {
        return res.status(403).json({ message: 'Forbidden' });
    }

    const status = whatsAppService.getStatus();
    res.json(status);
});

router.post('/restart', authenticate, async (req, res) => {
    // Check admin role
    const user = (req as any).user;
    if (user.role !== 'Admin' && user.role !== 'SuperAdmin') {
        return res.status(403).json({ message: 'Forbidden' });
    }

    await whatsAppService.restart();
    res.json({ message: 'WhatsApp Service Restarting...' });
});

export default router;
