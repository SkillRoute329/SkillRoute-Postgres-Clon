import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    [key: string]: unknown;
  };
}

/**
 * Middleware estricto para validar firma JWT local y aplicar control de acceso basado en roles (RBAC).
 * Elimina cualquier dependencia de validación en la nube (ej. Firebase Admin).
 */
export function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Acceso denegado: Token ausente o formato inválido' });
        return;
      }

      const token = authHeader.split(' ')[1];
      const secret = process.env.JWT_SECRET || 'skillroute-offline-secret';

      // Verificación local estricta
      const decoded = jwt.verify(token, secret) as { id: string; role: string };

      if (!decoded.role || !allowedRoles.includes(decoded.role)) {
        res.status(403).json({ 
          error: 'Acceso prohibido: Privilegios insuficientes para esta operación', 
          requiredRoles: allowedRoles, 
          currentRole: decoded.role 
        });
        return;
      }

      // Inyectar contexto validado en la petición
      req.user = decoded;
      next();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(401).json({ error: 'Firma de token inválida o expirada', details: msg });
      return;
    }
  };
}
