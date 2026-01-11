"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const whatsappService_1 = require("../services/whatsappService");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.get('/status', authMiddleware_1.authenticate, (req, res) => {
    // Check admin role
    const user = req.user;
    if (user.role !== 'Admin' && user.role !== 'SuperAdmin') {
        return res.status(403).json({ message: 'Forbidden' });
    }
    const status = whatsappService_1.whatsAppService.getStatus();
    res.json(status);
});
router.post('/restart', authMiddleware_1.authenticate, async (req, res) => {
    // Check admin role
    const user = req.user;
    if (user.role !== 'Admin' && user.role !== 'SuperAdmin') {
        return res.status(403).json({ message: 'Forbidden' });
    }
    await whatsappService_1.whatsAppService.restart();
    res.json({ message: 'WhatsApp Service Restarting...' });
});
exports.default = router;
