
import { Request, Response } from 'express';
import pool from '../db';

export const getSystemConfig = async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user.tenantId;
        if (!tenantId) {
            return res.status(401).json({ message: 'Token obsoleto. Por favor reloguee.' });
        }

        const result = await pool.query('SELECT * FROM "SystemConfig" WHERE "tenantId" = $1', [tenantId]);
        const config: Record<string, string> = {};
        result.rows.forEach(row => {
            config[row.key] = row.value;
        });
        res.json(config);
    } catch (error) {
        console.error('Error fetching system config:', error);
        res.status(500).json({ message: 'Error retrieving system configuration' });
    }
};

export const updateSystemConfig = async (req: Request, res: Response) => {
    const { key, value } = req.body;
    const tenantId = (req as any).user.tenantId;

    try {
        if (!tenantId) {
            return res.status(401).json({ message: 'Token obsoleto' });
        }

        await pool.query(
            `INSERT INTO "SystemConfig" ("key", "value", "updatedAt", "tenantId") 
             VALUES ($1, $2, NOW(), $3) 
             ON CONFLICT ("tenantId", "key") 
             DO UPDATE SET "value" = $2, "updatedAt" = NOW()`,
            [key, value, tenantId]
        );
        res.json({ message: 'Config updated', key, value });
    } catch (error) {
        console.error('Error updating system config:', error);
        res.status(500).json({ message: 'Error updating configuration' });
    }
};

// Internal migration trigger
export const initSchema = async (req: Request, res: Response) => {
    try {


        // 1. Create SystemConfig Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS "SystemConfig" (
                "key" TEXT NOT NULL,
                "value" TEXT NOT NULL,
                "description" TEXT,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
            );
        `);

        // 2. Add baseValue to ShiftCategory
        try {
            await pool.query(`
                ALTER TABLE "ShiftCategory" 
                ADD COLUMN "baseValue" DECIMAL(10,2) NOT NULL DEFAULT 0;
            `);

        } catch (e: any) {
            // Ignore if exists
        }

        res.json({ message: 'Schema initialized successfully' });
    } catch (error: any) {
        console.error('Migration error:', error);
        res.status(500).json({ message: 'Migration failed', error: error.message });
    }
};
