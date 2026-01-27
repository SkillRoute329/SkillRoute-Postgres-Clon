
import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        // Allow public access to specific routes if needed, otherwise 401
        // For now, strict 401
        // EXCEPT for OPTIONS/Preflight
        if (req.method === 'OPTIONS') return next();

        console.log('Unauthorized: No token provided');
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = header.split('Bearer ')[1];

    try {
        const decodedToken = await auth.verifyIdToken(token);
        (req as any).user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            tenantId: 1, // FORCE TENANT 1 for now
            role: decodedToken.role || 'User',
            name: decodedToken.name
        };
        next();
    } catch (error) {
        console.error('Token Verification Failed:', error);
        res.status(403).json({ message: 'Invalid Token' });
    }
};
