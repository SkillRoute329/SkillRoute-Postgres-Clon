
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const IS_RAILWAY = fs.existsSync('/app');
const STORAGE_ROOT = IS_RAILWAY ? '/app/uploads' : path.join(process.cwd(), 'uploads');

export const DoctorController = {
    checkHealth: async (req: Request, res: Response) => {
        const report: any = {
            timestamp: new Date().toISOString(),
            status: 'HEALTHY',
            checks: {}
        };

        // 1. DISK CHECK
        try {
            const testFile = path.join(STORAGE_ROOT, 'test-write.txt');
            fs.writeFileSync(testFile, 'Disk Check OK');
            if (fs.existsSync(testFile)) {
                fs.unlinkSync(testFile);
                report.checks.disk = { status: 'OK', path: STORAGE_ROOT };
            } else {
                throw new Error('File written but not found');
            }
        } catch (e: any) {
            report.status = 'CRITICAL';
            report.checks.disk = { status: 'FAIL', error: e.message, path: STORAGE_ROOT };
            console.error('🔥 [DOCTOR] Disk Check Failed:', e);
        }

        // 2. DB CHECK
        try {
            await prisma.$queryRaw`SELECT 1`;
            const userCount = await prisma.user.count();
            report.checks.database = { status: 'OK', userCount };
            if (userCount === 0) {
                report.checks.database.warning = 'ZERO USERS FOUND - SEED REQUIRED';
            }
        } catch (e: any) {
            report.status = 'CRITICAL';
            report.checks.database = { status: 'FAIL', error: e.message };
            console.error('🔥 [DOCTOR] DB Check Failed:', e);
        }

        // 3. ENV CHECK
        report.checks.env = {
            nodeEnv: process.env.NODE_ENV,
            isRailway: IS_RAILWAY
        };

        const code = report.status === 'HEALTHY' ? 200 : 500;
        res.status(code).json(report);
    }
};
