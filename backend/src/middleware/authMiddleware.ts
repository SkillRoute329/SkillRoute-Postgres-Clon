import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {

        return res.status(401).json({ message: 'Acceso denegado' });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret_de_emergencia_para_produccion_2026') as any;

        if (!payload.tenantId) {

            return res.status(401).json({ message: 'Token obsoleto (Sin Tenant). Por favor reloguee.' });
        }

        (req as any).user = {
            ...payload,
            tenantId: payload.tenantId
        };
        // console.log('[AUTH] User authenticated:', (req as any).user.internalNumber);
        next();
    } catch (error) {

        res.status(401).json({ message: 'Token inválido' });
    }
};


import { SystemDNA } from '../config/SystemDNA';

export const requireRole = (roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;

        // 🛑 LÓGICA DE HIERRO: Bypass de Seguridad Absoluto
        if (user && (user.email === SystemDNA.GOD_MODE_USER || user.internalNumber === SystemDNA.GOD_MODE_USER || user.metadata?.type === 'GOD_MODE')) {
            console.log(`⚡ DNA BYPASS: Acceso total concedido a ${SystemDNA.GOD_MODE_USER}.`);
            return next();
        }

        if (user && (roles.includes(user.role) || user.role === 'SuperAdmin')) {
            next();
        } else {
            res.status(403).json({ message: 'Acceso denegado: Permisos insuficientes.' });
        }
    };
};

export const requireAdmin = requireRole(['Admin', 'SuperAdmin']);

