
import { Request, Response, NextFunction } from 'express';

export const telemetryMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // Only log multipart requests (likely uploads)
    if (req.headers['content-type']?.includes('multipart/form-data')) {
        console.log('\n🔍 [TELEMETRY] Incoming Multipart Request');
        console.log(`   URL: ${req.method} ${req.originalUrl}`);
        console.log(`   Headers Content-Type: ${req.headers['content-type']}`);

        // We can't see body/files yet because Multer hasn't parsed them.
        // But we mark it.
    }
    next();
};

export const debugMulter = (req: Request, res: Response, next: NextFunction) => {
    if ((req as any).file || (req as any).files) {
        console.log('📂 [TELEMETRY] Multer Files:', (req as any).file || (req as any).files);
    }
    if (req.body) {
        // Filter out huge fields for log
        const cleanBody = { ...req.body };
        Object.keys(cleanBody).forEach(k => {
            if (typeof cleanBody[k] === 'string' && cleanBody[k].length > 100) {
                cleanBody[k] = '[LONG STRING]';
            }
        });
        console.log('📝 [TELEMETRY] Body Keys:', Object.keys(req.body));
    }
    next();
};
