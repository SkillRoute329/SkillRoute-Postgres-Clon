"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = requireAdmin;
/**
 * authMiddleware.ts — Middleware de autenticación compartido para Cloud Functions (Express)
 *
 * Verifica Firebase ID token + rol ADMIN/SUPERADMIN.
 * Usar como: app.post('/endpoint', requireAdmin, handler)
 */
const admin = __importStar(require("firebase-admin"));
const getDb = () => admin.firestore();
/**
 * Middleware: verifica que el request tenga un Firebase ID token válido
 * de un usuario con rol ADMIN o SUPERADMIN.
 */
async function requireAdmin(req, res, next) {
    var _a, _b, _c;
    const authHeader = req.headers.authorization;
    if (!(authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer '))) {
        res.status(401).json({ error: 'Auth requerida. Incluí Authorization: Bearer <token>' });
        return;
    }
    const idToken = authHeader.substring(7);
    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        const userDoc = await getDb().collection('users').doc(decoded.uid).get();
        if (!userDoc.exists) {
            res.status(403).json({ error: 'Usuario no registrado en el sistema' });
            return;
        }
        const data = (_a = userDoc.data()) !== null && _a !== void 0 ? _a : {};
        const rawRole = ((_c = ((_b = data.role) !== null && _b !== void 0 ? _b : data.rol)) !== null && _c !== void 0 ? _c : '').toString().toLowerCase();
        const isAdmin = rawRole === 'admin' || rawRole === 'superadmin';
        if (!isAdmin) {
            res.status(403).json({
                error: `Solo ADMIN o SUPERADMIN pueden usar este endpoint. Tu rol: '${rawRole || 'sin rol'}'`,
            });
            return;
        }
        req.user = decoded;
        next();
    }
    catch (_d) {
        res.status(401).json({ error: 'Token inválido o expirado. Volvé a iniciar sesión.' });
    }
}
