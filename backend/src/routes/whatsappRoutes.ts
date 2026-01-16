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

    const { clean } = req.body;
    await whatsAppService.restart(!!clean);
    res.json({ message: `WhatsApp Service Restarting... (Clean: ${!!clean})` });
});

export default router;
