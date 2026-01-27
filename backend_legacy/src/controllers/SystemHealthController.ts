import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import path from 'path';

const prisma = new PrismaClient();

export const SystemHealthController = {
    getStatus: async (req: Request, res: Response) => {
        const diagnostics: any = {
            database: { status: 'UNKNOWN', latency: 0, tables: {} },
            environment: { node: process.version, platform: process.platform },
            services: { auth: 'OK', import: 'OK' }
        };

        try {
            const start = Date.now();
            await prisma.$queryRaw`SELECT 1`;
            diagnostics.database.status = 'READY';
            diagnostics.database.latency = Date.now() - start;

            // Check tables counts
            const [users, vehicles, depts] = await Promise.all([
                prisma.user.count(),
                prisma.vehicle.count(),
                prisma.department.count()
            ]);
            diagnostics.database.tables = { users, vehicles, depts };

        } catch (e: any) {
            diagnostics.database.status = 'ERROR';
            diagnostics.database.error = e.message;
        }

        res.json(diagnostics);
    },

    getLogs: async (req: Request, res: Response) => {
        try {
            const logs = await prisma.actionLog.findMany({
                take: 50,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { fullName: true } } }
            });
            res.json(logs);
        } catch (e) {
            res.status(500).json({ message: 'Error fetching logs' });
        }
    },

    triggerUpdate: async (req: Request, res: Response) => {
        // This is a powerful endpoint. In a real prod env this would be more secure.
        // For this project, it runs the sync script or git pull.
        console.log("🚀 TRIGGERING SYSTEM UPDATE...");

        exec('node scripts/sync_github.js', (error, stdout, stderr) => {
            if (error) {
                console.error(`Update Error: ${error}`);
                return res.status(500).json({ message: 'Update Failed', error: stderr });
            }
            res.json({ message: 'Update Processed', output: stdout });
        });
    }
};
