import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {

        return res.status(401).json({ message: 'Acceso denegado' });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET as string) as any;

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
