
import { Request, Response, NextFunction } from 'express';
import admin from '../config/firebase';

/**
 * Middleware para validar tokens de Firebase Auth.
 * Reemplaza al validador JWT manual de 'authController'.
 */
export const firebaseAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No autenticado. Se requiere token Bearer.' });
    }

    const token = authHeader.split('Bearer ')[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);

        // Inyectamos el usuario en la request
        // Mapeamos los claims de Firebase a nuestra estructura interna si es necesario
        (req as any).user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            emailVerified: decodedToken.email_verified,
            ...decodedToken
        };

        next();
    } catch (error) {
        console.error('Firebase Auth Error:', error);
        return res.status(403).json({ message: 'Token inválido o expirado.' });
    }
};
