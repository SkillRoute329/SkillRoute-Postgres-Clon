"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const firebase_1 = require("../config/firebase");
const authMiddleware = async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        // Allow public access to specific routes if needed, otherwise 401
        // For now, strict 401
        // EXCEPT for OPTIONS/Preflight
        if (req.method === 'OPTIONS')
            return next();
        console.log('Unauthorized: No token provided');
        return res.status(401).json({ message: 'Unauthorized' });
    }
    const token = header.split('Bearer ')[1];
    try {
        const decodedToken = await firebase_1.auth.verifyIdToken(token);
        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            tenantId: 1,
            role: decodedToken.role || 'User',
            name: decodedToken.name
        };
        next();
    }
    catch (error) {
        console.error('Token Verification Failed:', error);
        res.status(403).json({ message: 'Invalid Token' });
    }
};
exports.authMiddleware = authMiddleware;
//# sourceMappingURL=authMiddleware.js.map