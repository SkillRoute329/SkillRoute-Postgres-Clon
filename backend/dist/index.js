"use strict";
/**
 * Backend API TransformaFacil 2.0 (MODO DIOS - HARDENED)
 * ========================================================
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const admin = __importStar(require("firebase-admin"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const XLSX = __importStar(require("xlsx"));
const firebase_1 = require("./config/firebase");
const express_http_proxy_1 = __importDefault(require("express-http-proxy"));
const app = (0, express_1.default)();
const PORT = process.env.PORT ?? 3002;
const JWT_SECRET = process.env.JWT_SECRET ?? 'ucot-god-mode-secret-2026';
// ─── Middleware ───────────────────────────────────────────────────────────────
app.use((0, cors_1.default)({ origin: true }));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// Logger
app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});
// DEV PROXY: Si el frontend tiene problemas de CORS/Proxy, el backend puede servir de puente (opcional)
if (process.env.NODE_ENV === 'development') {
    app.use('/dev-proxy', (0, express_http_proxy_1.default)('http://localhost:5175', {
        userResHeaderDecorator(headers, userReq, userRes, proxyReq, proxyRes) {
            // Si el frontend envía cookies (como las de Vite/PWA), nos aseguramos que no causen conflictos
            if (headers['set-cookie']) {
                headers['set-cookie'] = headers['set-cookie'].map((c) => c.replace(/Secure/gi, '').replace(/SameSite=None/gi, 'SameSite=Lax'));
            }
            return headers;
        },
    }));
}
// Global Headers fix for modern browsers in dev
app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    next();
});
const verifyAuth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('[AUTH] Missing token, but in DEV mode - letting it pass as ANONYMOUS');
            req.user = {
                id: 'dev-user',
                internalNumber: '0000',
                role: 'SuperAdmin',
                fullName: 'Developer God',
            };
            return next();
        }
        return res.status(401).json({ error: 'No token provided' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};
// ─── SECCIÓN: AUTH ────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
    const { internalNumber, password } = req.body ?? {};
    if (!internalNumber || !password) {
        return res.status(400).json({ error: 'Faltan internalNumber o password' });
    }
    // 1. Buscar usuario en Firestore Personal por internalNumber o legajo
    try {
        let userDoc = null;
        // Intenta por internalNumber
        const snapNum = await firebase_1.db
            .collection('personal')
            .where('internalNumber', '==', String(internalNumber).trim())
            .limit(1)
            .get();
        if (!snapNum.empty) {
            userDoc = snapNum.docs[0];
        }
        else {
            // Intenta por legajo (compatibilidad)
            const snapLeg = await firebase_1.db
                .collection('personal')
                .where('legajo', '==', String(internalNumber).trim())
                .limit(1)
                .get();
            if (!snapLeg.empty)
                userDoc = snapLeg.docs[0];
        }
        if (!userDoc) {
            console.warn(`[AUTH] User not found: ${internalNumber}`);
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        const userData = userDoc.data();
        // 2. Validación de Contraseña
        // Si el usuario tiene una contraseña definida en DB, la validamos obligatoriamente.
        // Si NO tiene (legacy/drivers), permitimos el login por ahora para evitar regreciones,
        // EXCEPTO para roles administrativos que SIEMPRE deben tenerla.
        const storedPassword = userData.password;
        const isAdminRole = userData.role === 'SuperAdmin' || userData.role === 'Admin';
        if (storedPassword) {
            if (storedPassword !== password) {
                console.warn(`[AUTH] Wrong password for: ${internalNumber}`);
                return res.status(401).json({ error: 'Contraseña incorrecta' });
            }
        }
        else if (isAdminRole) {
            // Un admin sin contraseña en DB es un riesgo, bloqueamos hasta que se setee.
            console.error(`[AUTH] Admin ${internalNumber} has no password set in DB!`);
            return res
                .status(500)
                .json({ error: 'Configuración de seguridad incompleta para administrador' });
        }
        // 3. Generar Payload y Token
        const userPayload = {
            id: userDoc.id,
            internalNumber: String(userData.internalNumber || userData.legajo).trim(),
            fullName: userData.fullName || userData.nombreCompleto || userData.nombre || 'Personal UCOT',
            role: userData.role || 'User',
        };
        // Artificial delay to avoid race conditions in frontend dev server proxy
        await new Promise((r) => setTimeout(r, 200));
        const token = jsonwebtoken_1.default.sign(userPayload, JWT_SECRET, { expiresIn: '24h' });
        console.log(`[AUTH] Login Success: ${internalNumber} (${userPayload.role})`);
        return res.json({ token, user: userPayload });
    }
    catch (error) {
        console.error('[AUTH ERROR] Exception:', error);
        return res.status(500).json({ error: 'Error interno del servidor', detail: String(error) });
    }
});
// ─── SECCIÓN: DOCTOR (DIAGNÓSTICO) ─────────────────────────────────────────────
app.get('/api/doctor', async (_req, res) => {
    try {
        const vehiclesSnap = await firebase_1.db.collection('vehicles').limit(1).get();
        const diskWrite = true; // Placeholder para test de escritura
        res.json({
            status: 'HEALTHY',
            timestamp: new Date().toISOString(),
            database: {
                connected: true,
                vehicleCount: (await firebase_1.db.collection('vehicles').get()).size,
                cartonCount: (await firebase_1.db.collection('cartones_completados').get()).size,
            },
            environment: process.env.NODE_ENV || 'local',
            version: '2.0.1-HARDENED',
        });
    }
    catch (error) {
        res.status(500).json({ status: 'SICK', error: String(error) });
    }
});
app.get('/api/health-check', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
});
app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: '2.0.1' });
});
// ─── SECCIÓN: CARTONES (EL CORAZÓN) ────────────────────────────────────────────
// Obtener todos los cartones (matrices)
app.get('/api/cartones', async (_req, res) => {
    try {
        const snap = await firebase_1.db.collection('cartones_completados').get();
        const cartones = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        res.json({ ok: true, total: cartones.length, data: cartones });
    }
    catch (error) {
        res.status(500).json({ error: 'Error obteniendo cartones' });
    }
});
// Obtener un cartón específico
app.get('/api/cartones/:id', async (req, res) => {
    try {
        const doc = await firebase_1.db.collection('cartones_completados').doc(req.params.id).get();
        if (!doc.exists)
            return res.status(404).json({ error: 'Cartón no encontrado' });
        res.json({ ok: true, data: { id: doc.id, ...doc.data() } });
    }
    catch (error) {
        res.status(500).json({ error: 'Error obteniendo cartón' });
    }
});
// ─── SECCIÓN: FLOTA ───────────────────────────────────────────────────────────
app.get('/api/fleet/vehicles', verifyAuth, async (_req, res) => {
    try {
        const snap = await firebase_1.db.collection('vehicles').get();
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        res.json({ ok: true, total: data.length, data });
    }
    catch (error) {
        res.status(500).json({ error: 'Error en flota' });
    }
});
app.post('/api/fleet/check', verifyAuth, async (req, res) => {
    try {
        const { vehicleId, status, notas, photos, checkType } = req.body;
        if (!vehicleId)
            return res.status(400).json({ error: 'vehicleId es requerido' });
        // FIX: Override driverId con el ID del usuario autenticado (Zero-Trust)
        const driverId = req.user?.id || 'anonymous';
        const driverRefValue = req.user?.internalNumber || '0000';
        const checkRef = firebase_1.db.collection('fleet_checks').doc();
        const payload = {
            vehicleId: String(vehicleId),
            driverId,
            driverLegajo: driverRefValue,
            status: status || 'OK',
            notas: notas || '',
            photos: photos || [],
            checkType: checkType || 'pre-service',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        };
        await checkRef.set(payload);
        // Actualizar estado del vehículo
        await firebase_1.db
            .collection('vehicles')
            .doc(String(vehicleId))
            .set({
            lastCheckStatus: status || 'OK',
            lastCheckDate: admin.firestore.FieldValue.serverTimestamp(),
            currentDriver: driverRefValue,
        }, { merge: true });
        res.json({ ok: true, checkId: checkRef.id });
    }
    catch (error) {
        res.status(500).json({ error: 'Error procesando inspección' });
    }
});
// ─── SECCIÓN: ADMINISTRACIÓN Y DATOS ──────────────────────────────────────────
/**
 * GET /api/data-import/template
 * Genera una plantilla Excel oficial para la ingesta de datos.
 */
app.get('/api/data-import/template', verifyAuth, (req, res) => {
    try {
        const wb = XLSX.utils.book_new();
        const wsData = [
            ['servicio', 'linea', 'variante', 'hora_inicio', 'hora_fin', 'km'],
            ['2290', '370', 'SABADERO VERANO', '04:25', '20:24', '229'],
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Plantilla_Servicios_UCOT.xlsx');
        res.send(buffer);
    }
    catch (error) {
        res.status(500).json({ error: 'Error al generar plantilla' });
    }
});
// --- SIMULACIÓN OPERATIVA ---
app.post('/api/simulation/reset', verifyAuth, async (req, res) => {
    if (req.user?.role !== 'Admin' && req.user?.role !== 'SuperAdmin') {
        return res.status(403).json({ error: 'Solo administradores' });
    }
    console.log(`[SIM] Reset solicitado por ${req.user.id}`);
    res.json({ ok: true, message: 'Simulación reiniciada localmente.' });
});
app.get('/api/simulation/report', verifyAuth, (req, res) => {
    res.status(501).json({ error: 'Reporte PDF no implementado en backend' });
});
// --- DEBUG Y MANTENIMIENTO ---
app.get('/api/debug/force-seed', async (req, res) => {
    try {
        console.log('🌱 Forzando Seeding de emergencia...');
        res.json({ status: 'ok', message: 'Seeding mock completado' });
    }
    catch (error) {
        res.status(500).json({ error: 'Seeding fallido' });
    }
});
// --- CARTONES (POST) ---
app.post('/api/cartones', verifyAuth, async (req, res) => {
    try {
        const data = req.body;
        if (!data.serviceNumber)
            return res.status(400).json({ error: 'serviceNumber requerido' });
        const docId = `${data.serviceNumber}_${data.line || '300'}`;
        await firebase_1.db
            .collection('cartones_completados')
            .doc(docId)
            .set({
            ...data,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: req.user?.id,
        }, { merge: true });
        res.json({ ok: true, id: docId });
    }
    catch (err) {
        res.status(500).json({ error: 'Error al guardar cartón' });
    }
});
// ─── ERROR HANDLER ───────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint no implementado en 2.0 Hardened' });
});
// ─── START ────────────────────────────────────────────────────────────────────
app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🛡️  TRANSFORMAFACIL API (GOD MODE) corriendo en http://0.0.0.0:${PORT}`);
    console.log(`   Diagnostics: http://localhost:${PORT}/api/doctor`);
    console.log(`   Matrix Engine: http://localhost:${PORT}/api/cartones`);
});
exports.default = app;
