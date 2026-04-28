/**
 * authMiddleware.ts — Middleware de autenticación compartido para Cloud Functions (Express)
 *
 * Verifica Firebase ID token + rol ADMIN/SUPERADMIN.
 * Usar como: app.post('/endpoint', requireAdmin, handler)
 */
import * as admin from 'firebase-admin';
import type { Request, Response, NextFunction } from 'express';

const getDb = () => admin.firestore();

/**
 * Middleware: verifica que el request tenga un Firebase ID token válido
 * de un usuario con rol ADMIN o SUPERADMIN.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
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
    const data = userDoc.data() ?? {};
    const rawRole = ((data.role ?? data.rol) ?? '').toString().toLowerCase();
    const isAdmin = rawRole === 'admin' || rawRole === 'superadmin';
    if (!isAdmin) {
      res.status(403).json({
        error: `Solo ADMIN o SUPERADMIN pueden usar este endpoint. Tu rol: '${rawRole || 'sin rol'}'`,
      });
      return;
    }
    (req as Request & { user?: typeof decoded }).user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado. Volvé a iniciar sesión.' });
  }
}
