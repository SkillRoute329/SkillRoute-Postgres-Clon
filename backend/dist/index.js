"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
const PORT = process.env.PORT ?? 3001;
app.use((0, cors_1.default)({ origin: true }));
app.use(express_1.default.json());
// Health para producción y monitoreo
app.get('/api/health', (_req, res) => {
    res.json({
        ok: true,
        service: 'transformafacil-api',
        timestamp: new Date().toISOString(),
    });
});
// SuperAdmin oficial: 329 / admin123. Cualquier otro usuario también se acepta (modo demo).
const SUPERADMIN_USER = '329';
const SUPERADMIN_PASSWORD = 'admin123';
app.post('/api/auth/login', (req, res) => {
    const { internalNumber, password } = req.body ?? {};
    if (!internalNumber || !password) {
        return res.status(400).json({ error: 'Faltan internalNumber o password' });
    }
    const isSuperAdmin = String(internalNumber).trim() === SUPERADMIN_USER && password === SUPERADMIN_PASSWORD;
    res.json({
        token: 'demo-token-' + Date.now(),
        user: {
            id: 1,
            internalNumber: String(internalNumber).trim() || '329',
            fullName: isSuperAdmin ? 'SuperAdministrador' : 'Usuario Demo',
            role: isSuperAdmin ? 'SuperAdmin' : 'Admin',
        },
    });
});
app.listen(PORT, () => {
    console.log(`Backend TransformaFacil en http://localhost:${PORT}`);
    console.log(`  Health: http://localhost:${PORT}/api/health`);
});
